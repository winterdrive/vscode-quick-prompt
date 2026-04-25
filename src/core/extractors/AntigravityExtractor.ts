/**
 * AntigravityExtractor.ts
 *
 * 讀取 Antigravity (Google DeepMind) 的對話記錄。
 *
 * 儲存路徑：
 *   ~\.gemini\antigravity\brain\{uuid}\.system_generated\logs\overview.txt
 *
 * overview.txt 格式：每行一個 JSON 物件，type 為 PLANNER_RESPONSE / TOOL_CALL_RESULT 等。
 * 我們只需要 source=USER 的 PLANNER_RESPONSE 作為 user，source=MODEL 作為 assistant。
 *
 * 優先找最近修改的 uuid 目錄。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CapturedSession, ChatMessage, IChatExtractor } from './types';

interface OverviewLine {
  step_index?: number;
  source?: 'USER' | 'MODEL' | 'USER_EXPLICIT' | string;
  type?: string;
  status?: string;
  created_at?: string;
  /** For USER type lines, the input text */
  input?: string;
  /** For MODEL lines with tool_calls, text content */
  tool_calls?: Array<{ name: string; args?: any }>;
  /** For TOOL_CALL_RESULT */
  result?: unknown;
  /** Direct content field (older format) */
  content?: string;
  /** User message text in some versions */
  text?: string;
}

export class AntigravityExtractor implements IChatExtractor {
  readonly ideId = 'antigravity' as const;

  private getBrainDir(): string {
    return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  }

  async extract(_workspacePath?: string): Promise<CapturedSession> {
    const brainDir = this.getBrainDir();

    try {
      await fs.access(brainDir);
    } catch {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: brainDir, readStatus: 'not_found' };
    }

    try {
      const uuids = await fs.readdir(brainDir);
      const candidates: Array<{ uuid: string; overviewPath: string; mtime: number }> = [];

      for (const uuid of uuids) {
        const overviewPath = path.join(brainDir, uuid, '.system_generated', 'logs', 'overview.txt');
        try {
          const s = await fs.stat(overviewPath);
          candidates.push({ uuid, overviewPath, mtime: s.mtimeMs });
        } catch { /* no overview.txt for this uuid */ }
      }

      if (candidates.length === 0) {
        return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: brainDir, readStatus: 'empty' };
      }

      candidates.sort((a, b) => b.mtime - a.mtime);
      const { uuid, overviewPath } = candidates[0];

      const raw = await fs.readFile(overviewPath, 'utf8');
      const messages = this.parseOverview(raw);

      return {
        sourceIde: this.ideId,
        capturedAt: new Date().toISOString(),
        sessionId: uuid,
        messages,
        rawPath: overviewPath,
        readStatus: messages.length > 0 ? 'success' : 'empty',
      };
    } catch (err) {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: brainDir, readStatus: 'error', errorDetail: String(err) };
    }
  }

  private parseOverview(raw: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }

      try {
        const obj = JSON.parse(trimmed) as OverviewLine;

        // User messages
        if ((obj.source === 'USER' || obj.source === 'USER_EXPLICIT') && (obj.input || obj.content || obj.text)) {
          const content = obj.input || obj.content || obj.text || '';
          if (content.trim()) {
            messages.push({
              role: 'user',
              content: content.trim(),
              timestamp: obj.created_at,
            });
          }
        } 
        // Model messages
        else if (obj.source === 'MODEL' && obj.type === 'PLANNER_RESPONSE') {
          // Case 1: Direct content
          if (obj.content || obj.text) {
             const content = obj.content || obj.text || '';
             if (content.trim()) {
               messages.push({ role: 'assistant', content: content.trim(), timestamp: obj.created_at });
             }
          }
          // Case 2: Tool calls (common in Agent mode)
          else if (obj.tool_calls) {
            for (const tc of obj.tool_calls) {
              if (tc.name === 'reply' || tc.name === 'respond' || tc.name === 'send_message' || tc.name === 'answer') {
                const content = typeof tc.args?.content === 'string' ? tc.args.content :
                                typeof tc.args?.message === 'string' ? tc.args.message :
                                typeof tc.args?.text === 'string' ? tc.args.text : '';
                if (content.trim()) {
                  messages.push({ role: 'assistant', content: content.trim(), timestamp: obj.created_at });
                }
              }
            }
          }
        }
      } catch { /* skip malformed lines */ }
    }

    return messages;
  }
}
