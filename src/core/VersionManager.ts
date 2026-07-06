/**
 * Core Version Manager — pure Node.js, no vscode dependency.
 *
 * Manages version history CRUD for prompt versions stored in:
 * `.vscode/.quickprompt/history/<promptId>.history.json`
 *
 * Features:
 * - Linear version history with smart deduplication
 * - Milestone tagging
 * - Smart retention policy (max 15 versions, protects milestones)
 * - Cache with invalidation
 */

import * as path from 'path';
import * as fs from 'fs';
import { VersionHistory, PromptVersion, CreateVersionOptions, PROMPT_CONSTANTS } from './types.js';
import { PathUtils } from './PathUtils.js';

export class VersionManager {
    private historyDir: string;
    private cache: Map<string, { history: VersionHistory; mtimeMs: number }> = new Map();

    constructor(private workspaceRoot: string) {
        this.historyDir = path.join(workspaceRoot, '.vscode', '.quickprompt', 'history');
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Load version history for a specific prompt.
     */
    loadHistory(promptId: string): VersionHistory {
        const historyPath = this.getHistoryPath(promptId);
        
        let currentMtime = 0;
        try {
            const stats = fs.statSync(historyPath);
            currentMtime = stats.mtimeMs;
        } catch {
            // File does not exist yet
        }

        if (this.cache.has(promptId)) {
            const cached = this.cache.get(promptId)!;
            if (cached.mtimeMs === currentMtime) {
                return JSON.parse(JSON.stringify(cached.history));
            }
        }

        if (currentMtime === 0) {
            const emptyHistory: VersionHistory = {
                promptId,
                versions: [],
                currentVersionId: '',
            };
            this.cache.set(promptId, { history: emptyHistory, mtimeMs: 0 });
            return { ...emptyHistory, versions: [] };
        }

        try {
            const content = fs.readFileSync(historyPath, 'utf-8');
            const parsed: unknown = JSON.parse(content);
            if (!VersionManager.isValidHistory(parsed)) {
                throw new Error(`Malformed version history shape for ${promptId}`);
            }
            const history: VersionHistory = parsed;
            this.cache.set(promptId, { history, mtimeMs: currentMtime });
            return JSON.parse(JSON.stringify(history));
        } catch {
            const emptyHistory: VersionHistory = {
                promptId,
                versions: [],
                currentVersionId: '',
            };
            return emptyHistory;
        }
    }

    /**
     * Type guard ensuring parsed JSON matches the expected VersionHistory shape,
     * so a corrupted or unexpectedly-shaped history.json falls back to empty
     * history instead of throwing later (e.g. `history.versions.find` on undefined).
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
     * Get version content by ID.
     */
    getVersionContent(promptId: string, versionId: string): string {
        const history = this.loadHistory(promptId);
        const version = history.versions.find(v => v.versionId === versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }
        return version.content;
    }

    /**
     * Get current version.
     */
    getCurrentVersion(promptId: string): PromptVersion | undefined {
        const history = this.loadHistory(promptId);
        return history.versions.find(v => v.versionId === history.currentVersionId);
    }

    /**
     * List all versions for a prompt.
     */
    listVersions(promptId: string): { versions: PromptVersion[]; currentVersionId: string } {
        const history = this.loadHistory(promptId);
        return {
            versions: history.versions,
            currentVersionId: history.currentVersionId,
        };
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Save version history to disk.
     */
    private saveHistory(history: VersionHistory): void {
        const historyPath = this.getHistoryPath(history.promptId);
        PathUtils.writeJsonFile(historyPath, history);
        
        let mtimeMs = 0;
        try {
            mtimeMs = fs.statSync(historyPath).mtimeMs;
        } catch {
            mtimeMs = Date.now();
        }

        this.cache.set(history.promptId, {
            history: JSON.parse(JSON.stringify(history)),
            mtimeMs
        });
    }

    /**
     * Create a new version. Returns the created version.
     * Smart deduplication: skips if content matches head.
     */
    createVersion(promptId: string, options: CreateVersionOptions): PromptVersion {
        const history = this.loadHistory(promptId);

        // Smart deduplication
        if (history.currentVersionId) {
            const currentVersion = history.versions.find(v => v.versionId === history.currentVersionId);
            if (currentVersion && currentVersion.content === options.content) {
                return currentVersion;
            }
        }

        const versionId = this.generateVersionId();
        const newVersion: PromptVersion = {
            versionId,
            content: options.content,
            timestamp: Date.now(),
            changeType: options.changeType,
        };

        if (options.milestoneLabel) {
            newVersion.milestone = {
                label: options.milestoneLabel,
                createdAt: Date.now(),
            };
        }

        // Add to history (newest first)
        history.versions.unshift(newVersion);
        history.currentVersionId = versionId;

        // Smart retention (don't prune on restore)
        if (options.changeType !== 'restore') {
            this.pruneVersions(history);
        }

        this.saveHistory(history);
        return newVersion;
    }

    /**
     * Apply (restore) a historical version.
     * Creates a new version with changeType: 'restore'.
     */
    applyVersion(promptId: string, versionId: string): PromptVersion {
        const history = this.loadHistory(promptId);
        const versionToRestore = history.versions.find(v => v.versionId === versionId);
        if (!versionToRestore) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }

        return this.createVersion(promptId, {
            content: versionToRestore.content,
            changeType: 'restore',
        });
    }

    /**
     * Delete a specific version.
     * Protection: cannot delete current version or the only version.
     */
    deleteVersion(promptId: string, versionId: string): void {
        const history = this.loadHistory(promptId);

        if (history.currentVersionId === versionId) {
            throw new Error('Cannot delete the current version');
        }
        if (history.versions.length <= 1) {
            throw new Error('Cannot delete the only version');
        }

        const idx = history.versions.findIndex(v => v.versionId === versionId);
        if (idx === -1) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }

        history.versions.splice(idx, 1);
        this.saveHistory(history);
    }

    // ── Milestones ────────────────────────────────────────────────────────────

    /**
     * Tag a version as a milestone.
     */
    tagMilestone(promptId: string, versionId: string, label: string): void {
        const history = this.loadHistory(promptId);
        const version = history.versions.find(v => v.versionId === versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }
        version.milestone = { label, createdAt: Date.now() };
        this.saveHistory(history);
    }

    /**
     * Rename a milestone.
     */
    renameMilestone(promptId: string, versionId: string, newLabel: string): void {
        const history = this.loadHistory(promptId);
        const version = history.versions.find(v => v.versionId === versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }
        if (!version.milestone) {
            throw new Error(`Version ${versionId} is not a milestone`);
        }
        version.milestone.label = newLabel;
        this.saveHistory(history);
    }

    /**
     * Remove milestone tag (keeps the version).
     */
    removeMilestone(promptId: string, versionId: string): void {
        const history = this.loadHistory(promptId);
        const version = history.versions.find(v => v.versionId === versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
        }
        delete version.milestone;
        this.saveHistory(history);
    }

    // ── Cache ─────────────────────────────────────────────────────────────────

    clearCache(promptId?: string): void {
        if (promptId) {
            this.cache.delete(promptId);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Delete all version history for a prompt.
     */
    deleteHistory(promptId: string): void {
        const historyPath = this.getHistoryPath(promptId);
        try {
            if (fs.existsSync(historyPath)) {
                fs.unlinkSync(historyPath);
            }
        } catch { /* ignore */ }
        this.cache.delete(promptId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private getHistoryPath(promptId: string): string {
        if (promptId.includes('..') || promptId.includes('/') || promptId.includes('\\')) {
            throw new Error(`Invalid promptId: ${promptId}`);
        }
        const safeId = path.basename(promptId);
        return path.join(this.historyDir, `${safeId}.history.json`);
    }

    private generateVersionId(): string {
        return `v${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    private pruneVersions(history: VersionHistory): void {
        while (history.versions.length > PROMPT_CONSTANTS.MAX_VERSIONS) {
            let indexToRemove = -1;
            for (let i = history.versions.length - 1; i >= 0; i--) {
                const v = history.versions[i];
                if (!v.milestone && v.versionId !== history.currentVersionId) {
                    indexToRemove = i;
                    break;
                }
            }
            if (indexToRemove !== -1) {
                history.versions.splice(indexToRemove, 1);
            } else {
                break; // All remaining are protected
            }
        }
    }
}
