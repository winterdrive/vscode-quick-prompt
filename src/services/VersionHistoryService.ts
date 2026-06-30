import * as vscode from 'vscode';
import * as path from 'path';
import { PromptVersion, VersionHistory, CreateVersionOptions } from '../types/versionHistory';

export interface VersionHistoryLocation {
    promptId: string;
    historyDir: string;
    cacheKey: string;
}

/**
 * Service for managing prompt version history
 * 
 * This service handles all version-related operations including:
 * - Loading and saving version history from/to disk
 * - Creating new versions
 * - Restoring previous versions
 * - Managing milestones
 * - Deleting versions
 */
export class VersionHistoryService {
    private historyDir: string;
    private cache: Map<string, VersionHistory> = new Map();
    private workspaceResolver?: (promptId: string) => VersionHistoryLocation | undefined;

    constructor(private context: vscode.ExtensionContext) {
        // Determine history directory based on workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', '.quickprompt', 'history');
            this.historyDir = vscodeDir.fsPath;
        } else {
            // Fallback to extension storage
            const extensionDir = vscode.Uri.joinPath(context.extensionUri, '.quickprompt', 'history');
            this.historyDir = extensionDir.fsPath;
        }
    }

    setWorkspaceResolver(resolver: (promptId: string) => VersionHistoryLocation | undefined): void {
        this.workspaceResolver = resolver;
    }

    /**
     * Load version history for a specific prompt
     */
    async loadHistory(promptId: string): Promise<VersionHistory> {
        const location = this.resolveLocation(promptId);
        // Check cache first
        if (this.cache.has(location.cacheKey)) {
            return this.cache.get(location.cacheKey)!;
        }

        try {
            const historyPath = this.getHistoryPath(location);
            const uri = vscode.Uri.file(historyPath);
            const content = await vscode.workspace.fs.readFile(uri);
            const parsed: unknown = JSON.parse(content.toString());

            if (!VersionHistoryService.isValidHistory(parsed)) {
                console.error(`Invalid version history shape for ${promptId}, resetting to empty`);
                const resetHistory: VersionHistory = {
                    promptId,
                    versions: [],
                    currentVersionId: ''
                };
                this.cache.set(location.cacheKey, resetHistory);
                return resetHistory;
            }

            const history = parsed;
            history.promptId = promptId;

            // Cache the loaded history
            this.cache.set(location.cacheKey, history);
            return history;
        } catch (error: any) {
            if (error.code === 'FileNotFound') {
                // Create empty history if file doesn't exist
                const emptyHistory: VersionHistory = {
                    promptId,
                    versions: [],
                    currentVersionId: ''
                };
                this.cache.set(location.cacheKey, emptyHistory);
                return emptyHistory;
            }
            if (error instanceof SyntaxError) {
                // Corrupted JSON file — reset rather than crash the tree view/migration flow
                console.error(`Failed to parse version history for ${promptId}, resetting to empty:`, error);
                const resetHistory: VersionHistory = {
                    promptId,
                    versions: [],
                    currentVersionId: ''
                };
                this.cache.set(location.cacheKey, resetHistory);
                return resetHistory;
            }
            throw error;
        }
    }

    /**
     * Type guard to ensure parsed JSON matches the expected VersionHistory shape.
     */
    private static isValidHistory(value: unknown): value is VersionHistory {
        return (
            !!value &&
            typeof value === 'object' &&
            Array.isArray((value as VersionHistory).versions) &&
            typeof (value as VersionHistory).currentVersionId === 'string'
        );
    }

    /**
     * Save version history to disk
     */
    async saveHistory(history: VersionHistory): Promise<void> {
        try {
            const location = this.resolveLocation(history.promptId);
            const historyPath = this.getHistoryPath(location);
            const uri = vscode.Uri.file(historyPath);
            const dirUri = vscode.Uri.file(location.historyDir);

            // Ensure directory exists
            await vscode.workspace.fs.createDirectory(dirUri);

            // Save to disk
            const storageHistory: VersionHistory = {
                ...history,
                promptId: location.promptId
            };
            const content = JSON.stringify(storageHistory, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

            // Update cache
            this.cache.set(location.cacheKey, history);
        } catch (error) {
            console.error(`Failed to save version history for ${history.promptId}:`, error);
            throw error;
        }
    }

    private promptProvider?: any; // Avoiding circular import issues by using any, or usage interface

    setPromptProvider(provider: any) {
        this.promptProvider = provider;
    }

    /**
     * Helper to notify provider of updates
     */
    private async notifyProvider(promptId: string, history: VersionHistory) {
        if (this.promptProvider) {
            await this.promptProvider.updatePromptMetadata(promptId, {
                totalVersions: history.versions.length,
                latestVersionId: history.currentVersionId
            });
        }
    }

    /**
     * Create a new version for a prompt
     */
    async createVersion(
        promptId: string,
        options: CreateVersionOptions
    ): Promise<PromptVersion> {
        const history = await this.loadHistory(promptId);

        // Smart Deduplication: If content matches current head, don't create new version
        if (history.currentVersionId) {
            const currentVersion = history.versions.find(v => v.versionId === history.currentVersionId);
            if (currentVersion && currentVersion.content === options.content) {
                return currentVersion;
            }
        }

        // Generate new version ID
        const versionId = this.generateVersionId();

        // Create new version
        const newVersion: PromptVersion = {
            versionId,
            content: options.content,
            timestamp: Date.now(),
            changeType: options.changeType
        };

        // Add milestone if provided
        if (options.milestoneLabel) {
            newVersion.milestone = {
                label: options.milestoneLabel,
                createdAt: Date.now()
            };
        }

        // Add to history (newest first)
        history.versions.unshift(newVersion);
        history.currentVersionId = versionId;

        // Smart Retention Policy: Max 15 versions
        // EXCEPTION EXEMPTION: Do not prune if this is a 'restore' operation
        // This prevents "testing" restores from destroying history
        if (options.changeType !== 'restore') {
            const MAX_VERSIONS = 15;

            while (history.versions.length > MAX_VERSIONS) {
                // Find the oldest non-milestone version
                let indexToRemove = -1;

                // Iterate from the end (oldest versions)
                for (let i = history.versions.length - 1; i >= 0; i--) {
                    const v = history.versions[i];

                    // Do not remove:
                    // 1. Milestones
                    // 2. The current version (just created, so it's at index 0, but good to be safe)
                    if (!v.milestone && v.versionId !== history.currentVersionId) {
                        indexToRemove = i;
                        break;
                    }
                }

                if (indexToRemove !== -1) {
                    // Remove the victim
                    history.versions.splice(indexToRemove, 1);
                } else {
                    // All remaining versions are protected (all milestones or current)
                    // Stop pruning to avoid data loss
                    break;
                }
            }
        }

        // Save to disk
        await this.saveHistory(history);

        // Notify provider
        await this.notifyProvider(promptId, history);

        return newVersion;
    }

    /**
     * Restore a specific version (creates a new version with changeType: 'restore')
     */
    async restoreVersion(promptId: string, versionId: string): Promise<PromptVersion> {
        const history = await this.loadHistory(promptId);

        // Find the version to restore
        const versionToRestore = history.versions.find(v => v.versionId === versionId);
        if (!versionToRestore) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }

        // Create a new version with the restored content
        const restoredVersion = await this.createVersion(promptId, {
            content: versionToRestore.content,
            changeType: 'restore'
        });

        // createVersion handles notification

        return restoredVersion;
    }

    /**
     * Tag a version as a milestone
     */
    async tagMilestone(promptId: string, versionId: string, label: string): Promise<void> {
        const history = await this.loadHistory(promptId);

        // Find the version
        const version = history.versions.find(v => v.versionId === versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }

        // Add or update milestone
        version.milestone = {
            label,
            createdAt: Date.now()
        };

        // Save to disk
        await this.saveHistory(history);
        // Metadata doesn't change for adding tag, but safe to update just in case
    }

    /**
     * Remove milestone tag from a version (keeps the version)
     */
    async removeMilestone(promptId: string, versionId: string): Promise<void> {
        const history = await this.loadHistory(promptId);

        // Find the version
        const version = history.versions.find(v => v.versionId === versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }

        // Remove milestone
        delete version.milestone;

        // Save to disk
        await this.saveHistory(history);
    }

    /**
     * Delete a specific version
     * Protection: Cannot delete current version or the only version
     */
    async deleteVersion(promptId: string, versionId: string): Promise<void> {
        const history = await this.loadHistory(promptId);

        // Protection: Cannot delete current version
        if (history.currentVersionId === versionId) {
            throw new Error('Cannot delete the current version');
        }

        // Protection: Cannot delete if it's the only version
        if (history.versions.length <= 1) {
            throw new Error('Cannot delete the only version');
        }

        // Find and remove the version
        const index = history.versions.findIndex(v => v.versionId === versionId);
        if (index === -1) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }

        history.versions.splice(index, 1);

        // Save to disk
        await this.saveHistory(history);

        // Notify provider
        await this.notifyProvider(promptId, history);
    }

    /**
     * Get the content of a specific version
     */
    async getVersionContent(promptId: string, versionId: string): Promise<string> {
        const history = await this.loadHistory(promptId);
        const version = history.versions.find(v => v.versionId === versionId);

        if (!version) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }

        return version.content;
    }

    /**
     * Get the current version
     */
    async getCurrentVersion(promptId: string): Promise<PromptVersion | undefined> {
        const history = await this.loadHistory(promptId);
        return history.versions.find(v => v.versionId === history.currentVersionId);
    }

    /**
     * Clear cache for a specific prompt (useful after external changes)
     */
    clearCache(promptId?: string): void {
        if (promptId) {
            this.cache.delete(this.resolveLocation(promptId).cacheKey);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Delete all version history for a prompt
     */
    async deleteHistory(promptId: string): Promise<void> {
        try {
            const location = this.resolveLocation(promptId);
            const historyPath = this.getHistoryPath(location);
            const uri = vscode.Uri.file(historyPath);
            await vscode.workspace.fs.delete(uri);
            this.cache.delete(location.cacheKey);

            // Notify provider (reset meta)
            if (this.promptProvider) {
                await this.promptProvider.updatePromptMetadata(promptId, {
                    totalVersions: 0,
                    latestVersionId: undefined
                });
            }

        } catch (error: any) {
            if (error.code !== 'FileNotFound') {
                throw error;
            }
            // Ignore if file doesn't exist
        }
    }

    /**
     * Get the file path for a prompt's history
     */
    private resolveLocation(promptId: string): VersionHistoryLocation {
        return this.workspaceResolver?.(promptId) ?? {
            promptId,
            historyDir: this.historyDir,
            cacheKey: promptId
        };
    }

    private getHistoryPath(location: VersionHistoryLocation): string {
        // Validation: Ensure promptId is safe (no path traversal)
        if (
            location.promptId.includes('..') ||
            location.promptId.includes('/') ||
            location.promptId.includes('\\') ||
            location.promptId.includes(':')
        ) {
            throw new Error(`Invalid promptId: ${location.promptId}`);
        }

        const safePromptId = path.basename(location.promptId);
        return path.join(location.historyDir, `${safePromptId}.history.json`);
    }

    /**
     * Generate a unique version ID
     */
    private generateVersionId(): string {
        return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
