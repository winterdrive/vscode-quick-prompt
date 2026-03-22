/**
 * Privacy masking tool handlers for MCP server.
 */

import { PrivacyManager } from '../../../src/core/PrivacyManager.js';
import type { DictionaryEntry, MaskingResult } from '../../../src/core/types.js';
import type { ToolResponse } from '../types.js';
import { ErrorType } from '../types.js';
import { createSuccess, createError } from '../utils/ResponseFactory.js';

export class PrivacyTools {
  constructor(private privacyManager: PrivacyManager) {}

  async maskText(args: { text: string }): Promise<ToolResponse<MaskingResult>> {
    try {
      if (!args.text || args.text.trim().length === 0) {
        return createError(ErrorType.VALIDATION_ERROR, 'Text cannot be empty.');
      }

      const result = this.privacyManager.maskText(args.text);
      return createSuccess(result, `Masked ${result.tokens.length} sensitive item(s).`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to mask text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async unmaskText(args: { maskedText: string }): Promise<ToolResponse<{ originalText: string }>> {
    try {
      if (!args.maskedText || args.maskedText.trim().length === 0) {
        return createError(ErrorType.VALIDATION_ERROR, 'Masked text cannot be empty.');
      }

      const originalText = this.privacyManager.unmaskText(args.maskedText);
      return createSuccess({ originalText }, 'Text unmasked successfully.');
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to unmask text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listDictionary(): Promise<ToolResponse<{ entries: DictionaryEntry[]; total: number; enabledCount: number }>> {
    try {
      const entries = this.privacyManager.getDictionaryEntries();
      const enabledCount = entries.filter(e => e.enabled).length;
      return createSuccess({
        entries,
        total: entries.length,
        enabledCount,
      });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to list dictionary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async addDictionaryEntry(args: {
    pattern: string;
    label: string;
    isRegex?: boolean;
    enabled?: boolean;
    note?: string;
  }): Promise<ToolResponse<DictionaryEntry>> {
    try {
      if (!args.pattern || args.pattern.trim().length === 0) {
        return createError(ErrorType.VALIDATION_ERROR, 'Pattern cannot be empty.');
      }
      if (!args.label || args.label.trim().length === 0) {
        return createError(ErrorType.VALIDATION_ERROR, 'Label cannot be empty.');
      }

      const entry = this.privacyManager.addDictionaryEntry({
        pattern: args.pattern,
        label: args.label,
        isRegex: args.isRegex ?? false,
        enabled: args.enabled ?? true,
        note: args.note,
      });

      return createSuccess(entry, `Dictionary entry "${args.pattern}" added.`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to add dictionary entry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async editDictionaryEntry(args: {
    id: string;
    pattern?: string;
    label?: string;
    isRegex?: boolean;
    enabled?: boolean;
    note?: string;
  }): Promise<ToolResponse<DictionaryEntry>> {
    try {
      // editDictionaryEntry throws if not found
      let entry: DictionaryEntry;
      try {
        entry = this.privacyManager.editDictionaryEntry(args.id, {
          ...(args.pattern !== undefined && { pattern: args.pattern }),
          ...(args.label !== undefined && { label: args.label }),
          ...(args.isRegex !== undefined && { isRegex: args.isRegex }),
          ...(args.enabled !== undefined && { enabled: args.enabled }),
          ...(args.note !== undefined && { note: args.note }),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Dictionary entry not found: ${args.id}`);
        }
        throw e;
      }

      return createSuccess(entry, 'Dictionary entry updated.');
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to edit dictionary entry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteDictionaryEntry(args: { id: string }): Promise<ToolResponse<{ deletedId: string }>> {
    try {
      const result = this.privacyManager.deleteDictionaryEntry(args.id);
      if (!result) {
        return createError(ErrorType.NOT_FOUND, `Dictionary entry not found: ${args.id}`);
      }
      return createSuccess({ deletedId: args.id }, 'Dictionary entry deleted.');
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to delete dictionary entry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async toggleDictionaryEntry(args: { id: string }): Promise<ToolResponse<{ id: string; enabled: boolean }>> {
    try {
      // toggleDictionaryEntry throws if not found
      let entry: DictionaryEntry;
      try {
        entry = this.privacyManager.toggleDictionaryEntry(args.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Dictionary entry not found: ${args.id}`);
        }
        throw e;
      }
      return createSuccess(
        { id: entry.id, enabled: entry.enabled },
        `Dictionary entry ${entry.enabled ? 'enabled' : 'disabled'}.`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to toggle dictionary entry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
