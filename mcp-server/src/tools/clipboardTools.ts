import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ToolResponse } from '../types.js';
import { ErrorType } from '../types.js';
import { createSuccess, createError } from '../utils/ResponseFactory.js';

export interface ClipboardHistoryItem {
    id: string;              
    content: string;         
    preview: string;         
    timestamp: number;       
    source: 'vscode' | 'external';  
    length: number;          
}

export class ClipboardTools {
  private getStoragePath(): string {
    return path.join(os.homedir(), '.quickprompt', 'clipboard-history.json');
  }

  private loadHistory(): ClipboardHistoryItem[] {
    const storagePath = this.getStoragePath();
    if (fs.existsSync(storagePath)) {
      try {
        const data = fs.readFileSync(storagePath, 'utf-8');
        const parsed: unknown = JSON.parse(data);
        return Array.isArray(parsed) ? (parsed as ClipboardHistoryItem[]) : [];
      } catch (err) {
        throw new Error(`Failed to read clipboard history: ${err}`);
      }
    }
    return [];
  }

  async getClipboardItem(args: { index: number }): Promise<ToolResponse<{ index: number; content: string; timestamp: number }>> {
    try {
      const history = this.loadHistory();
      if (!history || history.length === 0) {
        return createError(ErrorType.NOT_FOUND, 'Clipboard history is empty.');
      }

      // Convert 1-based index (if the AI mistakenly uses 1) or 0-based.
      // Usually, index might be 0, 1, 2. Let's assume 0-based, but handle bounds gracefully.
      const maxIndex = history.length - 1;
      let targetIndex = args.index;
      
      if (targetIndex < 0 || targetIndex > maxIndex) {
         return createError(ErrorType.VALIDATION_ERROR, `Index out of bounds. Valid indices are 0 to ${maxIndex}.`);
      }

      const item = history[targetIndex];
      return createSuccess({
        index: targetIndex,
        content: item.content,
        timestamp: item.timestamp
      }, `Successfully retrieved clipboard item at index ${targetIndex}.`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to get clipboard item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
