/**
 * CopilotExtractor.ts
 * 
 * 讀取 VS Code GitHub Copilot Chat 的歷史記錄。
 * 
 * 儲存路徑：%APPDATA%/Code/User/globalStorage/emptyWindowChatSessions/
 * 格式：每個 session 一個 .json 或 .jsonl 檔案
 *   - .json：舊版格式，根層級有 `requests[]`，每個 request 有 message (user) + response[] (assistant)
 *   - .jsonl：新版格式，每行一個 JSON 物件
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CapturedSession, ChatMessage, IChatExtractor } from './types';

// ─── Copilot JSON Schema Types ─────────────────────────────────────────────────

interface CopilotMessagePart {
  kind?: string;
  value?: string;
  supportThemeIcons?: boolean;
  supportHtml?: boolean;
}

interface CopilotRequest {
  message?: {
    text?: string;
    parts?: CopilotMessagePart[];
  };
  response?: CopilotMessagePart[];
  timestamp?: number;
  modelId?: string;
}

interface CopilotSession {
  version?: number;
  sessionId?: string;
  creationDate?: number;
  lastMessageDate?: number;
  customTitle?: string;
  requests?: CopilotRequest[];
}

// ─── JSONL types ───────────────────────────────────────────────────────────────

interface CopilotJsonlLine {
  kind?: number;
  v?: CopilotSession;
}

// ─── Extractor ─────────────────────────────────────────────────────────────────

export class CopilotExtractor implements IChatExtractor {
  readonly ideId = 'copilot' as const;

  private getBaseDir(): string {
    const appData = process.env.APPDATA || '';
    return path.join(appData, 'Code', 'User', 'globalStorage', 'emptyWindowChatSessions');
  }

  async extract(_workspacePath?: string): Promise<CapturedSession> {
    const baseDir = this.getBaseDir();

    try {
      await fs.access(baseDir);
    } catch {
      return {
        sourceIde: this.ideId,
        capturedAt: new Date().toISOString(),
        messages: [],
        rawPath: baseDir,
        readStatus: 'not_found',
        errorDetail: `Directory not found: ${baseDir}`,
      };
    }

    try {
      const entries = await fs.readdir(baseDir);
      const sessionFiles = entries.filter(e => e.endsWith('.json') || e.endsWith('.jsonl'));

      if (sessionFiles.length === 0) {
        return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: baseDir, readStatus: 'empty' };
      }

      // Sort by mtime descending, pick the most recently modified session that has content
      const stats = await Promise.all(
        sessionFiles.map(async f => ({ name: f, mtime: (await fs.stat(path.join(baseDir, f))).mtimeMs }))
      );
      stats.sort((a, b) => b.mtime - a.mtime);

      for (const { name } of stats) {
        const filePath = path.join(baseDir, name);
        const raw = await fs.readFile(filePath, 'utf8');

        let session: CopilotSession | undefined;

        if (name.endsWith('.jsonl')) {
          // JSONL: take the first line which is the root session object
          const firstLine = raw.split('\n').find(l => l.trim());
          if (firstLine) {
            const parsed = JSON.parse(firstLine) as CopilotJsonlLine;
            session = parsed.v;
          }
        } else {
          // Plain JSON
          session = JSON.parse(raw) as CopilotSession;
        }

        if (!session || !session.requests || session.requests.length === 0) {
          continue; // try next file
        }

        const messages = this.parseMessages(session.requests);
        if (messages.length === 0) { continue; }

        return {
          sourceIde: this.ideId,
          capturedAt: new Date().toISOString(),
          sessionId: session.sessionId,
          title: session.customTitle,
          messages,
          rawPath: filePath,
          readStatus: 'success',
        };
      }

      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: baseDir, readStatus: 'empty' };
    } catch (err) {
      return {
        sourceIde: this.ideId,
        capturedAt: new Date().toISOString(),
        messages: [],
        rawPath: baseDir,
        readStatus: 'error',
        errorDetail: String(err),
      };
    }
  }

  private parseMessages(requests: CopilotRequest[]): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const req of requests) {
      // User message
      const userText = req.message?.text?.trim() ?? '';
      if (userText) {
        messages.push({
          role: 'user',
          content: userText,
          timestamp: req.timestamp ? new Date(req.timestamp).toISOString() : undefined,
        });
      }

      // Assistant response: collect text parts only
      if (req.response) {
        const assistantParts = req.response
          .filter(p => p.value && !p.kind) // text parts have no `kind` field
          .map(p => p.value ?? '')
          .join('');
        if (assistantParts.trim()) {
          messages.push({
            role: 'assistant',
            content: assistantParts.trim(),
            timestamp: req.timestamp ? new Date(req.timestamp).toISOString() : undefined,
          });
        }
      }
    }

    return messages;
  }
}
