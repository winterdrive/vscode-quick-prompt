/**
 * CursorExtractor.ts
 *
 * 讀取 Cursor IDE 的 Agent 對話記錄。
 *
 * 儲存路徑：~/.cursor/projects/{project-slug}/agent-transcripts/{uuid}/{uuid}.jsonl
 * project-slug 格式：路徑中的斜線與冒號換成連字號
 *   例如：C:\Users\kwz50\PromptManager → c-Users-kwz50-PromptManager
 *
 * JSONL 格式：每行一個 JSON 物件，含 role + message.content
 *   {"role":"user","message":{"content":[{"type":"text","text":"..."}]}}
 *   {"role":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CapturedSession, ChatMessage, IChatExtractor } from './types';

interface CursorJsonlLine {
  role: 'user' | 'assistant';
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

export class CursorExtractor implements IChatExtractor {
  readonly ideId = 'cursor' as const;

  private getProjectsDir(): string {
    return path.join(os.homedir(), '.cursor', 'projects');
  }

  /**
   * Convert a workspace path to the Cursor project slug format.
   * e.g. "C:\Users\kwz50\PromptManager" → "c-Users-kwz50-PromptManager"
   */
  private pathToSlug(workspacePath: string): string {
    return workspacePath
      .replace(/^([A-Za-z]):/, (_, drive) => drive.toLowerCase()) // lowercase drive
      .replace(/[/\\:]/g, '-');                                    // slashes/colons → dash
  }

  async extract(workspacePath?: string): Promise<CapturedSession> {
    const projectsDir = this.getProjectsDir();

    try {
      await fs.access(projectsDir);
    } catch {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: projectsDir, readStatus: 'not_found' };
    }

    // Find the project directory
    let targetProjectDir: string | undefined;

    if (workspacePath) {
      const slug = this.pathToSlug(workspacePath);
      const candidate = path.join(projectsDir, slug);
      try {
        await fs.access(candidate);
        targetProjectDir = candidate;
      } catch {
        // fall through to scan
      }
    }

    // If not found by slug, find the most recently modified project
    if (!targetProjectDir) {
      try {
        const entries = await fs.readdir(projectsDir);
        const statsArr = await Promise.all(
          entries.map(async e => {
            try {
              const s = await fs.stat(path.join(projectsDir, e));
              return { name: e, mtime: s.mtimeMs };
            } catch {
              return { name: e, mtime: 0 };
            }
          })
        );
        statsArr.sort((a, b) => b.mtime - a.mtime);
        if (statsArr.length > 0) {
          targetProjectDir = path.join(projectsDir, statsArr[0].name);
        }
      } catch (err) {
        return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: projectsDir, readStatus: 'error', errorDetail: String(err) };
      }
    }

    if (!targetProjectDir) {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: projectsDir, readStatus: 'empty' };
    }

    const transcriptsDir = path.join(targetProjectDir, 'agent-transcripts');
    try {
      await fs.access(transcriptsDir);
    } catch {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: targetProjectDir, readStatus: 'empty' };
    }

    // Find the latest transcript
    try {
      const uuidDirs = await fs.readdir(transcriptsDir);
      const latestJsonls: Array<{ filePath: string; mtime: number }> = [];

      for (const uuidDir of uuidDirs) {
        const jsonlPath = path.join(transcriptsDir, uuidDir, `${uuidDir}.jsonl`);
        try {
          const s = await fs.stat(jsonlPath);
          // Check if file is not empty (e.g. > 100 bytes)
          if (s.size > 100) {
            latestJsonls.push({ filePath: jsonlPath, mtime: s.mtimeMs });
          }
        } catch { /* skip */ }
      }

      if (latestJsonls.length === 0) {
        return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: transcriptsDir, readStatus: 'empty' };
      }

      // Sort by mtime DESC to get the latest active session
      latestJsonls.sort((a, b) => b.mtime - a.mtime);
      const chosenFile = latestJsonls[0].filePath;

      const raw = await fs.readFile(chosenFile, 'utf8');
      const messages = this.parseJsonl(raw);

      return {
        sourceIde: this.ideId,
        capturedAt: new Date().toISOString(),
        workspacePath: targetProjectDir,
        messages,
        rawPath: chosenFile,
        readStatus: messages.length > 0 ? 'success' : 'empty',
      };
    } catch (err) {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: transcriptsDir, readStatus: 'error', errorDetail: String(err) };
    }
  }

  private parseJsonl(raw: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }

      try {
        const obj = JSON.parse(trimmed) as CursorJsonlLine;
        if (obj.role !== 'user' && obj.role !== 'assistant') { continue; }

        const text = (obj.message?.content ?? [])
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text ?? '')
          .join('\n')
          .trim();

        if (text) {
          messages.push({ role: obj.role, content: text });
        }
      } catch { /* skip malformed lines */ }
    }

    return messages;
  }
}
