/**
 * Version history tool handlers for MCP server.
 */

import { VersionManager } from '../../../src/core/VersionManager.js';
import { PromptManager, OptimisticLockError } from '../../../src/core/PromptManager.js';
import type { PromptVersion } from '../../../src/core/types.js';
import type { ToolResponse, VersionSummary } from '../types.js';
import { ErrorType } from '../types.js';
import { createSuccess, createError } from '../utils/ResponseFactory.js';

export class VersionTools {
  constructor(
    private versionManager: VersionManager,
    private promptManager: PromptManager,
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

  async listVersions(args: { promptId: string }): Promise<ToolResponse<{ promptId: string; versions: VersionSummary[]; total: number; milestoneCount: number }>> {
    try {
      const { versions } = this.versionManager.listVersions(args.promptId);
      const milestoneCount = versions.filter(v => v.milestone).length;
      return createSuccess({
        promptId: args.promptId,
        versions: versions.map(v => this.toSummary(v)),
        total: versions.length,
        milestoneCount,
      });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to list versions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getVersion(args: { promptId: string; versionId: string }): Promise<ToolResponse<{ promptId: string; version: PromptVersion }>> {
    try {
      // getVersionContent throws if not found
      try {
        this.versionManager.getVersionContent(args.promptId, args.versionId);
      } catch {
        return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
      }

      // Get the full version entry
      const { versions } = this.versionManager.listVersions(args.promptId);
      const version = versions.find(v => v.versionId === args.versionId);
      if (!version) {
        return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
      }

      return createSuccess({ promptId: args.promptId, version });
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to get version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async applyVersion(args: { promptId: string; versionId: string }): Promise<ToolResponse<{ promptId: string; restoredVersionId: string; newVersionId: string }>> {
    try {
      // Validate prompt exists
      const prompt = this.promptManager.getPrompt(args.promptId);
      if (!prompt) {
        return createError(ErrorType.NOT_FOUND, `Prompt not found: ${args.promptId}`);
      }

      // Get the version content (throws if not found)
      let restoredContent: string;
      try {
        restoredContent = this.versionManager.getVersionContent(args.promptId, args.versionId);
      } catch {
        return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
      }

      // Apply the version (creates a restore entry)
      const newVersion = this.versionManager.applyVersion(args.promptId, args.versionId);

      // Update the prompt content
      this.withRetry(() =>
        this.promptManager.editPrompt(args.promptId, { content: restoredContent }),
      );

      return createSuccess(
        {
          promptId: args.promptId,
          restoredVersionId: args.versionId,
          newVersionId: newVersion.versionId,
        },
        `Prompt restored to version ${args.versionId}. A new version was created to record the restore.`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to apply version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteVersion(args: { promptId: string; versionId: string }): Promise<ToolResponse<{ deletedVersionId: string }>> {
    try {
      // deleteVersion returns void and throws on error
      try {
        this.versionManager.deleteVersion(args.promptId, args.versionId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { deletedVersionId: args.versionId },
        `Version ${args.versionId} deleted.`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to delete version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async tagMilestone(args: { promptId: string; versionId: string; name: string }): Promise<ToolResponse<{ versionId: string; milestone: string }>> {
    try {
      // tagMilestone returns void and throws on error
      try {
        this.versionManager.tagMilestone(args.promptId, args.versionId, args.name);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { versionId: args.versionId, milestone: args.name },
        `Version ${args.versionId} tagged as "${args.name}".`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to tag milestone: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async renameMilestone(args: { promptId: string; versionId: string; newName: string }): Promise<ToolResponse<{ versionId: string; milestone: string }>> {
    try {
      // renameMilestone returns void and throws on error
      try {
        this.versionManager.renameMilestone(args.promptId, args.versionId, args.newName);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found or has no milestone: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { versionId: args.versionId, milestone: args.newName },
        `Milestone renamed to "${args.newName}".`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to rename milestone: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeMilestone(args: { promptId: string; versionId: string }): Promise<ToolResponse<{ versionId: string }>> {
    try {
      // removeMilestone returns void and throws on error
      try {
        this.versionManager.removeMilestone(args.promptId, args.versionId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return createError(ErrorType.NOT_FOUND, `Version not found or has no milestone: ${args.versionId}`);
        }
        return createError(ErrorType.VALIDATION_ERROR, msg);
      }
      return createSuccess(
        { versionId: args.versionId },
        `Milestone removed from version ${args.versionId}.`,
      );
    } catch (error) {
      return createError(ErrorType.INTERNAL_ERROR, `Failed to remove milestone: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
