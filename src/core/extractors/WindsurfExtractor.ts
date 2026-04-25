/**
 * WindsurfExtractor.ts
 *
 * 讀取 Windsurf (Codeium Cascade) 的對話記錄。
 *
 * 儲存路徑：~/.codeium/windsurf/cascade/{uuid}.pb
 *
 * 格式為 Protobuf。為了不引入額外的 protobuf 編譯依賴，
 * 我們實作一個輕量級的「二進位字串萃取器 (Binary String Extractor)」，
 * 將檔案中長度大於一定字元的 UTF-8 字串直接抓取出來作為對話內容。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CapturedSession, ChatMessage, IChatExtractor } from './types';

export class WindsurfExtractor implements IChatExtractor {
  readonly ideId = 'windsurf' as const;

  private getCascadeDir(): string {
    return path.join(os.homedir(), '.codeium', 'windsurf', 'cascade');
  }

  async extract(_workspacePath?: string): Promise<CapturedSession> {
    const cascadeDir = this.getCascadeDir();

    try {
      await fs.access(cascadeDir);
    } catch {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: cascadeDir, readStatus: 'not_found' };
    }

    try {
      const files = await fs.readdir(cascadeDir);
      const pbFiles = files.filter(f => f.endsWith('.pb'));

      if (pbFiles.length === 0) {
        return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: cascadeDir, readStatus: 'empty' };
      }

      // Sort by modified time descending
      const stats = await Promise.all(
        pbFiles.map(async f => {
          try {
            return { name: f, mtime: (await fs.stat(path.join(cascadeDir, f))).mtimeMs };
          } catch {
            return { name: f, mtime: 0 };
          }
        })
      );
      stats.sort((a, b) => b.mtime - a.mtime);
      const latestFile = path.join(cascadeDir, stats[0].name);
      const uuid = stats[0].name.replace('.pb', '');

      const buffer = await fs.readFile(latestFile);
      const extractedText = this.extractPrintableStrings(buffer);

      // We cannot easily determine role from raw strings without schema, 
      // but we can look for markers or just dump everything as a single context.
      const messages: ChatMessage[] = [];
      for (const text of extractedText) {
        if (text.length > 30) {
          messages.push({
            role: 'assistant', // Default to assistant to provide context
            content: text.trim()
          });
        }
      }

      return {
        sourceIde: this.ideId,
        capturedAt: new Date().toISOString(),
        sessionId: uuid,
        messages,
        rawPath: latestFile,
        readStatus: messages.length > 0 ? 'success' : 'empty',
      };

    } catch (err) {
      return { sourceIde: this.ideId, capturedAt: new Date().toISOString(), messages: [], rawPath: cascadeDir, readStatus: 'error', errorDetail: String(err) };
    }
  }

  /**
   * 簡易的二進位字串萃取機制，尋找連續的可列印 ASCII 或 UTF-8 字元
   */
  private extractPrintableStrings(buffer: Buffer): string[] {
    const strings: string[] = [];
    let currentString: number[] = [];

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      // Allow ASCII printable (32-126) and common UTF-8 ranges
      // We are more restrictive here to avoid binary noise
      if ((byte >= 0x20 && byte <= 0x7E) || (byte >= 0x09 && byte <= 0x0D) || byte >= 0xA0) {
        currentString.push(byte);
      } else {
        if (currentString.length >= 30) {
          try {
            const str = Buffer.from(currentString).toString('utf8');
            if (this.isHumanText(str)) {
              strings.push(str);
            }
          } catch { /* ignore invalid utf8 */ }
        }
        currentString = [];
      }
    }

    if (currentString.length >= 30) {
      try {
        const str = Buffer.from(currentString).toString('utf8');
        if (this.isHumanText(str)) {
          strings.push(str);
        }
      } catch { /* ignore invalid utf8 */ }
    }

    return strings;
  }

  private isHumanText(str: string): boolean {
    // Heuristics to filter out binary noise
    // 1. Density of printable characters
    const printableCount = (str.match(/[\x20-\x7E\u4e00-\u9fa5\s\n\t]/g) || []).length;
    const ratio = printableCount / str.length;
    
    // 2. Must contain at least some letters or CJK characters
    const hasLanguage = /[a-zA-Z\u4e00-\u9fa5]/.test(str);
    
    // 3. Avoid long sequences of identical characters (often found in binary)
    const tooManyRepeats = /(.)\1{10,}/.test(str);

    return ratio > 0.85 && hasLanguage && !tooManyRepeats;
  }
}
