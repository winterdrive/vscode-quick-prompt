import { OptimisticLockError } from '../../../src/core/PromptManager.js';
import type { Prompt } from '../../../src/core/types.js';
import type { ToolResponse, PromptSummary } from '../types.js';
import { ErrorType } from '../types.js';
import { createSuccess, createError } from '../utils/ResponseFactory.js';
import type { WorkspaceBinding, WorkspaceRefArgs } from '../workspaceTypes.js';

type WorkspacePromptSummary = PromptSummary & {
  workspace: string;
  workspaceId: string;
  workspaceUri: string;
};

type WorkspacePrompt = Prompt & {
  workspace: string;
  workspaceId: string;
  workspaceUri: string;
};

type PromptIdArgs = { id: string } & WorkspaceRefArgs;

export class PromptTools {
  constructor(
    private getWorkspace: (workspaceRef?: string) => WorkspaceBinding | undefined,
    private getAllWorkspaces: () => WorkspaceBinding[]
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

  private toSummary(p: Prompt, ws: WorkspaceBinding): WorkspacePromptSummary {
    return {
      id: this.wrapId(ws, p.id),
      title: p.title,
      contentPreview: p.content.length > 100 ? p.content.slice(0, 100) + '...' : p.content,
      use_count: p.use_count,
      pinned: p.pinned ?? false,
      created_at: p.created_at,
      last_used: p.last_used,
      order: p.order ?? 0,
      workspace: ws.name,
      workspaceId: ws.id,
      workspaceUri: ws.uri,
    };
  }

  private wrapPrompt(p: Prompt, ws: WorkspaceBinding): WorkspacePrompt {
    return {
      ...p,
      id: this.wrapId(ws, p.id),
      workspace: ws.name,
      workspaceId: ws.id,
      workspaceUri: ws.uri,
    };
  }

  private wrapId(ws: WorkspaceBinding, promptId: string): string {
    return `${ws.name}:${promptId}`;
  }

  private parsePrefixedId(prefixedId: string): { wsName: string; actualId: string } | undefined {
    const colonIndex = prefixedId.indexOf(':');
    if (colonIndex === -1) {
      return undefined;
    }
    return {
      wsName: prefixedId.substring(0, colonIndex),
      actualId: prefixedId.substring(colonIndex + 1),
    };
  }

  private getWorkspaceRef(args: WorkspaceRefArgs, fallbackName?: string): string | undefined {
    return args.workspaceId || args.workspaceUri || args.workspace || fallbackName;
  }

  async listPrompts(): Promise<ToolResponse<{ prompts: WorkspacePromptSummary[]; total: number; pinnedCount: number }>> {
    try {
      let allSummaries: WorkspacePromptSummary[] = [];
      let totalPinned = 0;
      const workspaces = this.getAllWorkspaces();

      for (const ws of workspaces) {
        const prompts = ws.promptManager.getPrompts();
        const summaries = prompts.map(p => this.toSummary(p, ws));
        allSummaries = allSummaries.concat(summaries);
        totalPinned += prompts.filter(p => !!p.pinned).length;
      }

      return createSuccess({
        prompts: allSummaries,
        total: allSummaries.length,
        pinnedCount: totalPinned,
      });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getPrompt(args: PromptIdArgs): Promise<ToolResponse<WorkspacePrompt>> {
    try {
      const parsed = this.parsePrefixedId(args.id);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'ID must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      const prompt = ws.promptManager.getPrompt(parsed.actualId);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${parsed.actualId} in workspace ${parsed.wsName}`);
      }
      return createSuccess(this.wrapPrompt(prompt, ws));
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to get prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async createPrompt(args: { title: string; content: string; pinned?: boolean } & WorkspaceRefArgs): Promise<ToolResponse<WorkspacePrompt>> {
    try {
      const ws = this.getWorkspace(this.getWorkspaceRef(args));
      if (!ws) {
        return createError(
          ErrorType.NOT_FOUND,
          `Workspace not found: ${this.getWorkspaceRef(args) || 'default'}. Please specify a valid target workspace.`
        );
      }

      const prompt = this.withRetry(() =>
        ws.promptManager.createPrompt(args.title, args.content, {
          pinned: args.pinned,
          titleSource: 'user',
        }),
      );

      // Create initial version
      try {
        ws.versionManager.createVersion(prompt.id, {
          content: prompt.content,
          changeType: 'create',
        });
      } catch {
        // Non-critical — prompt is still created
      }

      return createSuccess(this.wrapPrompt(prompt, ws), `Prompt "${prompt.title}" created successfully in workspace "${ws.name}".`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to create prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async editPrompt(args: PromptIdArgs & { title?: string; content?: string }): Promise<ToolResponse<WorkspacePrompt>> {
    try {
      if (!args.title && !args.content) {
        return createError(ErrorType.VALIDATION_ERROR, 'At least one of title or content must be provided.');
      }

      const parsed = this.parsePrefixedId(args.id);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'ID must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      // Get current prompt for version tracking
      const current = ws.promptManager.getPrompt(parsed.actualId);
      if (!current) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${parsed.actualId}`);
      }

      const updated = this.withRetry(() =>
        ws.promptManager.editPrompt(parsed.actualId, {
          title: args.title,
          content: args.content,
        }),
      );

      // Create version if content changed
      if (args.content && args.content !== current.content) {
        try {
          ws.versionManager.createVersion(parsed.actualId, {
            content: args.content,
            changeType: 'edit',
          });
        } catch {
          // Non-critical
        }
      }

      return createSuccess(this.wrapPrompt(updated, ws), `Prompt "${updated.title}" updated successfully.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return createError(ErrorType.NOT_FOUND, error.message);
      }
      return createError(ErrorType.INTERNAL_ERROR, `Failed to edit prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deletePrompt(args: PromptIdArgs): Promise<ToolResponse<{ deletedId: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.id);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'ID must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      const prompt = ws.promptManager.getPrompt(parsed.actualId);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${parsed.actualId}`);
      }

      const title = prompt.title;
      this.withRetry(() => ws.promptManager.deletePrompt(parsed.actualId));

      // Also delete version history
      try {
        ws.versionManager.deleteHistory(parsed.actualId);
      } catch {
        // Non-critical
      }

      return createSuccess({ deletedId: args.id }, `Prompt "${title}" deleted successfully.`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to delete prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async togglePin(args: PromptIdArgs): Promise<ToolResponse<{ id: string; pinned: boolean; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.id);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'ID must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      const updated = this.withRetry(() => ws.promptManager.togglePin(parsed.actualId));
      return createSuccess(
        { id: this.wrapId(ws, updated.id), pinned: updated.pinned ?? false, workspace: ws.name, workspaceId: ws.id, workspaceUri: ws.uri },
        `Prompt "${updated.title}" ${updated.pinned ? 'pinned' : 'unpinned'}.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return createError(ErrorType.NOT_FOUND, error.message);
      }
      return createError(ErrorType.INTERNAL_ERROR, `Failed to toggle pin: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async movePrompt(args: PromptIdArgs & { direction: 'up' | 'down' }): Promise<ToolResponse<{ id: string; newOrder: number; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.id);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'ID must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      const updated = this.withRetry(() => ws.promptManager.movePrompt(parsed.actualId, args.direction));
      return createSuccess(
        { id: this.wrapId(ws, updated.id), newOrder: updated.order ?? 0, workspace: ws.name, workspaceId: ws.id, workspaceUri: ws.uri },
        `Prompt moved ${args.direction}.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return createError(ErrorType.NOT_FOUND, error.message);
      }
      return createError(ErrorType.INTERNAL_ERROR, `Failed to move prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async searchPrompts(args: { query: string }): Promise<ToolResponse<{ prompts: WorkspacePromptSummary[]; total: number; query: string }>> {
    try {
      let allResults: WorkspacePromptSummary[] = [];
      const workspaces = this.getAllWorkspaces();

      for (const ws of workspaces) {
        const results = ws.promptManager.searchPrompts(args.query);
        const summaries = results.map(p => this.toSummary(p, ws));
        allResults = allResults.concat(summaries);
      }

      return createSuccess({
        prompts: allResults,
        total: allResults.length,
        query: args.query,
      });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to search prompts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async copyPromptContent(args: PromptIdArgs): Promise<ToolResponse<{ id: string; content: string; use_count: number; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.id);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'ID must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      const prompt = ws.promptManager.getPrompt(parsed.actualId);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${parsed.actualId}`);
      }

      // Increment use count
      try {
        this.withRetry(() => ws.promptManager.incrementUseCount(parsed.actualId));
      } catch {
        // Non-critical
      }

      return createSuccess({
        id: this.wrapId(ws, parsed.actualId),
        content: prompt.content,
        use_count: prompt.use_count + 1,
        workspace: ws.name,
        workspaceId: ws.id,
        workspaceUri: ws.uri,
      }, `Content copied. Use count: ${prompt.use_count + 1}.`);
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to copy prompt content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
