/**
 * KiroExtractor.ts
 *
 * 讀取 Kiro 的對話記錄。
 *
 * 儲存路徑：%APPDATA%\Kiro\User\globalStorage\kiro.kiroagent\
 * 在此目錄下的各專案 hash 資料夾中，會有很多 `.chat` 檔案，內容為 JSON。
 *
 * JSON 結構大致為：
 * {
 *   "context": [
 *     { "role": "user", "content": "..." },
 *     { "role": "bot", "content": "..." },
 *     { "role": "tool", "content": "..." }
 *   ]
 * }
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CapturedSession, ChatMessage, IChatExtractor } from './types';

interface KiroChatFile {
  chat?: Array<{
    role?: string;
    content?: string;
  }>;
}

export class KiroExtractor implements IChatExtractor {
  readonly ideId = 'kiro' as const;

  private getStorageDir(): string {
    const appData = process.env.APPDATA || '';
    return path.join(appData, 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent');
  }

  async extract(workspacePath?: string): Promise<CapturedSession> {
    const storageDir = this.getStorageDir();

    try {
      await fs.access(storageDir);
    } catch {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: storageDir, readStatus: 'not_found' };
    }

    try {
      const dirs = await fs.readdir(storageDir);
      const candidates: Array<{ filePath: string; mtime: number }> = [];

      for (const dir of dirs) {
        const fullDirPath = path.join(storageDir, dir);
        try {
          const stat = await fs.stat(fullDirPath);
          if (!stat.isDirectory()) continue;

          // Skip hidden or internal dirs
          if (dir.startsWith('.')) continue;

          const files = await fs.readdir(fullDirPath);
          for (const file of files) {
            if (file.endsWith('.chat')) {
              const filePath = path.join(fullDirPath, file);
              const fStat = await fs.stat(filePath);
              
              // If workspacePath is provided, we could try to filter by content
              // But for now, we just pick the latest active chat across all Kiro projects
              // as Kiro's hash logic is non-trivial.
              candidates.push({ filePath, mtime: fStat.mtimeMs });
            }
          }
        } catch { /* skip */ }
      }

      if (candidates.length === 0) {
        return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: storageDir, readStatus: 'empty' };
      }

      // Sort by mtime DESC
      candidates.sort((a, b) => b.mtime - a.mtime);
      const targetFile = candidates[0].filePath;

      const raw = await fs.readFile(targetFile, 'utf8');
      const messages = this.parseKiroChat(raw);

      return {
        sourceIde: this.ideId,
        capturedAt: new Date().toISOString(),
        messages,
        rawPath: targetFile,
        readStatus: messages.length > 0 ? 'success' : 'empty',
      };
    } catch (err) {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: storageDir, readStatus: 'error', errorDetail: String(err) };
    }
  }

  private parseKiroChat(raw: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    try {
      const obj = JSON.parse(raw) as KiroChatFile;
      const chatArr = obj.chat || [];
      if (!Array.isArray(chatArr)) return [];

      for (const msg of chatArr) {
        if (!msg.content || !msg.role) continue;
        const text = msg.content.trim();
        if (!text) continue;

        let role: ChatMessage['role'] = 'assistant';
        if (msg.role === 'human' || msg.role === 'user') role = 'user';
        else if (msg.role === 'tool') role = 'tool';
        else if (msg.role === 'bot' || msg.role === 'assistant') role = 'assistant';

        messages.push({ role, content: text });
      }
    } catch { /* ignore parse error */ }

    return messages;
  }
}
