/**
 * Prompt management tool handlers for MCP server.
 */

import { PromptManager, OptimisticLockError } from '../../../src/core/PromptManager.js';
import { VersionManager } from '../../../src/core/VersionManager.js';
import type { Prompt } from '../../../src/core/types.js';
import type { ToolResponse, PromptSummary } from '../types.js';
import { ErrorType } from '../types.js';
import { createSuccess, createError } from '../utils/ResponseFactory.js';

export class PromptTools {
  constructor(
    private promptManager: PromptManager,
    private versionManager: VersionManager,
  ) {}

  /**
   * Optimistic lock retry wrapper — retries up to 3 times on conflict.
   */
  private withRetry<T>(fn: () => T): T {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return fn();
      } catch (e) {
        if (e instanceof OptimisticLockError && attempt < 3) continue;
        throw e;
      }
    }
    throw new Error('Optimistic lock conflict — still failing after 3 retries');
  }

  private toSummary(p: Prompt): PromptSummary {
    return {
      id: p.id,
      title: p.title,
      contentPreview: p.content.length > 100 ? p.content.slice(0, 100) + '...' : p.content,
      use_count: p.use_count,
      pinned: p.pinned ?? false,
      created_at: p.created_at,
      last_used: p.last_used,
      order: p.order ?? 0,
    };
  }

  async listPrompts(): Promise<ToolResponse<{ prompts: PromptSummary[]; total: number; pinnedCount: number }>> {
    try {
      const prompts = this.promptManager.getPrompts();
      const summaries = prompts.map(p => this.toSummary(p));
      const pinnedCount = prompts.filter(p => !!p.pinned).length;
      return createSuccess({
        prompts: summaries,
        total: prompts.length,
        pinnedCount,
      });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getPrompt(args: { id: string }): Promise<ToolResponse<Prompt>> {
    try {
      const prompt = this.promptManager.getPrompt(args.id);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${args.id}`);
      }
      return createSuccess(prompt);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to get prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async createPrompt(args: { title: string; content: string; pinned?: boolean }): Promise<ToolResponse<Prompt>> {
    try {
      const prompt = this.withRetry(() =>
        this.promptManager.createPrompt(args.title, args.content, {
          pinned: args.pinned,
          titleSource: 'user',
        }),
      );

      // Create initial version
      try {
        this.versionManager.createVersion(prompt.id, {
          content: prompt.content,
          changeType: 'create',
        });
      } catch {
        // Non-critical — prompt is still created
      }

      return createSuccess(prompt, `Prompt "${prompt.title}" created successfully.`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to create prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async editPrompt(args: { id: string; title?: string; content?: string }): Promise<ToolResponse<Prompt>> {
    try {
      if (!args.title && !args.content) {
        return createError(ErrorType.VALIDATION_ERROR, 'At least one of title or content must be provided.');
      }

      // Get current prompt for version tracking
      const current = this.promptManager.getPrompt(args.id);
      if (!current) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${args.id}`);
      }

      const updated = this.withRetry(() =>
        this.promptManager.editPrompt(args.id, {
          title: args.title,
          content: args.content,
        }),
      );

      // Create version if content changed
      if (args.content && args.content !== current.content) {
        try {
          this.versionManager.createVersion(args.id, {
            content: args.content,
            changeType: 'edit',
          });
        } catch {
          // Non-critical
        }
      }

      return createSuccess(updated, `Prompt "${updated.title}" updated successfully.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return createError(ErrorType.NOT_FOUND, error.message);
      }
      return createError(ErrorType.INTERNAL_ERROR, `Failed to edit prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deletePrompt(args: { id: string }): Promise<ToolResponse<{ deletedId: string }>> {
    try {
      const prompt = this.promptManager.getPrompt(args.id);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${args.id}`);
      }

      const title = prompt.title;
      this.withRetry(() => this.promptManager.deletePrompt(args.id));

      // Also delete version history
      try {
        this.versionManager.deleteHistory(args.id);
      } catch {
        // Non-critical
      }

      return createSuccess({ deletedId: args.id }, `Prompt "${title}" deleted successfully.`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to delete prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async togglePin(args: { id: string }): Promise<ToolResponse<{ id: string; pinned: boolean }>> {
    try {
      const updated = this.withRetry(() => this.promptManager.togglePin(args.id));
      return createSuccess(
        { id: updated.id, pinned: updated.pinned ?? false },
        `Prompt "${updated.title}" ${updated.pinned ? 'pinned' : 'unpinned'}.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return createError(ErrorType.NOT_FOUND, error.message);
      }
      return createError(ErrorType.INTERNAL_ERROR, `Failed to toggle pin: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async movePrompt(args: { id: string; direction: 'up' | 'down' }): Promise<ToolResponse<{ id: string; newOrder: number }>> {
    try {
      const updated = this.withRetry(() => this.promptManager.movePrompt(args.id, args.direction));
      return createSuccess(
        { id: updated.id, newOrder: updated.order ?? 0 },
        `Prompt moved ${args.direction}.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return createError(ErrorType.NOT_FOUND, error.message);
      }
      return createError(ErrorType.INTERNAL_ERROR, `Failed to move prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async searchPrompts(args: { query: string }): Promise<ToolResponse<{ prompts: PromptSummary[]; total: number; query: string }>> {
    try {
      const results = this.promptManager.searchPrompts(args.query);
      return createSuccess({
        prompts: results.map(p => this.toSummary(p)),
        total: results.length,
        query: args.query,
      });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to search prompts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async copyPromptContent(args: { id: string }): Promise<ToolResponse<{ id: string; content: string; use_count: number }>> {
    try {
      const prompt = this.promptManager.getPrompt(args.id);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${args.id}`);
      }

      // Increment use count
      try {
        this.withRetry(() => this.promptManager.incrementUseCount(args.id));
      } catch {
        // Non-critical
      }

      return createSuccess({
        id: prompt.id,
        content: prompt.content,
        use_count: prompt.use_count + 1,
      }, `Content copied. Use count: ${prompt.use_count + 1}.`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to copy prompt content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
