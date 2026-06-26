import { OptimisticLockError } from '../../../src/core/PromptManager.js';
import type { PromptVersion } from '../../../src/core/types.js';
import type { ToolResponse, VersionSummary } from '../types.js';
import { ErrorType } from '../types.js';
import { createSuccess, createError } from '../utils/ResponseFactory.js';
import type { WorkspaceBinding, WorkspaceRefArgs } from '../workspaceTypes.js';

type PromptIdArgs = { promptId: string } & WorkspaceRefArgs;

export class VersionTools {
  constructor(
    private getWorkspace: (workspaceRef?: string) => WorkspaceBinding | undefined,
  ) {}

  /**
   * Optimistic lock retry wrapper.
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

  private toSummary(v: PromptVersion): VersionSummary {
    return {
      versionId: v.versionId,
      timestamp: v.timestamp,
      changeType: v.changeType,
      contentPreview: v.content.length > 80 ? v.content.slice(0, 80) + '...' : v.content,
      milestone: v.milestone ? { label: v.milestone.label, createdAt: v.milestone.createdAt } : undefined,
    };
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

  async listVersions(args: PromptIdArgs): Promise<ToolResponse<{ promptId: string; versions: VersionSummary[]; total: number; milestoneCount: number; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.promptId);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'promptId must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      const { versions } = ws.versionManager.listVersions(parsed.actualId);
      const milestoneCount = versions.filter(v => v.milestone).length;
      return createSuccess({
        promptId: args.promptId,
        versions: versions.map(v => this.toSummary(v)),
        total: versions.length,
        milestoneCount,
        workspace: ws.name,
        workspaceId: ws.id,
        workspaceUri: ws.uri,
      });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to list versions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getVersion(args: PromptIdArgs & { versionId: string }): Promise<ToolResponse<{ promptId: string; version: PromptVersion; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.promptId);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'promptId must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      // getVersionContent throws if not found
      try {
        ws.versionManager.getVersionContent(parsed.actualId, args.versionId);
      } catch {
        return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
      }

      // Get the full version entry
      const { versions } = ws.versionManager.listVersions(parsed.actualId);
      const version = versions.find(v => v.versionId === args.versionId);
      if (!version) {
        return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
      }

      return createSuccess({ promptId: args.promptId, version, workspace: ws.name, workspaceId: ws.id, workspaceUri: ws.uri });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to get version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async applyVersion(args: PromptIdArgs & { versionId: string }): Promise<ToolResponse<{ promptId: string; restoredVersionId: string; newVersionId: string; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.promptId);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'promptId must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      // Validate prompt exists
      const prompt = ws.promptManager.getPrompt(parsed.actualId);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${parsed.actualId} in workspace ${parsed.wsName}`);
      }

      // Get the version content (throws if not found)
      let restoredContent: string;
      try {
        restoredContent = ws.versionManager.getVersionContent(parsed.actualId, args.versionId);
      } catch {
        return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
      }

      // Apply the version (creates a restore entry)
      const newVersion = ws.versionManager.applyVersion(parsed.actualId, args.versionId);

      // Update the prompt content
      this.withRetry(() =>
        ws.promptManager.editPrompt(parsed.actualId, { content: restoredContent }),
      );

      return createSuccess(
        {
          promptId: args.promptId,
          restoredVersionId: args.versionId,
          newVersionId: newVersion.versionId,
          workspace: ws.name,
          workspaceId: ws.id,
          workspaceUri: ws.uri,
        },
        `Prompt restored to version ${args.versionId}. A new version was created to record the restore.`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to apply version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteVersion(args: PromptIdArgs & { versionId: string }): Promise<ToolResponse<{ deletedVersionId: string; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.promptId);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'promptId must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      // deleteVersion returns void and throws on error
      try {
        ws.versionManager.deleteVersion(parsed.actualId, args.versionId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { deletedVersionId: args.versionId, workspace: ws.name, workspaceId: ws.id, workspaceUri: ws.uri },
        `Version ${args.versionId} deleted.`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to delete version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async tagMilestone(args: PromptIdArgs & { versionId: string; name: string }): Promise<ToolResponse<{ versionId: string; milestone: string; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.promptId);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'promptId must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      // tagMilestone returns void and throws on error
      try {
        ws.versionManager.tagMilestone(parsed.actualId, args.versionId, args.name);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { versionId: args.versionId, milestone: args.name, workspace: ws.name, workspaceId: ws.id, workspaceUri: ws.uri },
        `Version ${args.versionId} tagged as "${args.name}".`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to tag milestone: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async renameMilestone(args: PromptIdArgs & { versionId: string; newName: string }): Promise<ToolResponse<{ versionId: string; milestone: string; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.promptId);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'promptId must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      // renameMilestone returns void and throws on error
      try {
        ws.versionManager.renameMilestone(parsed.actualId, args.versionId, args.newName);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found or has no milestone: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { versionId: args.versionId, milestone: args.newName, workspace: ws.name, workspaceId: ws.id, workspaceUri: ws.uri },
        `Milestone renamed to "${args.newName}".`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to rename milestone: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeMilestone(args: PromptIdArgs & { versionId: string }): Promise<ToolResponse<{ versionId: string; workspace: string; workspaceId: string; workspaceUri: string }>> {
    try {
      const parsed = this.parsePrefixedId(args.promptId);
      if (!parsed) {
        return createError(ErrorType.VALIDATION_ERROR, 'promptId must be prefixed with workspace name (e.g. projectA:001)');
      }

      const ws = this.getWorkspace(this.getWorkspaceRef(args, parsed.wsName));
      if (!ws) {
        return createError(ErrorType.NOT_FOUND, `Workspace not found: ${this.getWorkspaceRef(args, parsed.wsName)}`);
      }

      // removeMilestone returns void and throws on error
      try {
        ws.versionManager.removeMilestone(parsed.actualId, args.versionId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found or has no milestone: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { versionId: args.versionId, workspace: ws.name, workspaceId: ws.id, workspaceUri: ws.uri },
        `Milestone removed from version ${args.versionId}.`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to remove milestone: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
