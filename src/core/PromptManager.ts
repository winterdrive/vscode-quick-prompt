/**
 * Core Prompt Manager — pure Node.js, no vscode dependency.
 * 
 * Manages CRUD operations on `.vscode/prompts.json` with:
 * - Optimistic locking (file mtime as version)
 * - Cache with deep copy safety
 * - Backup on corruption
 */

import * as path from 'path';
import * as fs from 'fs';
import { Prompt, PROMPT_CONSTANTS } from './types.js';
import { PathUtils } from './PathUtils.js';

export class OptimisticLockError extends Error {
    constructor(message: string = 'File was modified by another process') {
        super(message);
        this.name = 'OptimisticLockError';
    }
}

export interface LoadResult {
    prompts: Prompt[];
    version: number; // file mtime
}

export class PromptManager {
    private promptsFilePath: string;
    private cachedPrompts: Prompt[] | null = null;
    private cachedVersion: number = 0;

    constructor(private workspaceRoot: string) {
        this.promptsFilePath = path.join(workspaceRoot, '.vscode', 'prompts.json');
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Load prompts from disk with version tracking.
     */
    loadPrompts(): LoadResult {
        if (!fs.existsSync(this.promptsFilePath)) {
            return { prompts: [], version: 0 };
        }
        try {
            const content = fs.readFileSync(this.promptsFilePath, 'utf-8');
            const prompts: Prompt[] = JSON.parse(content);
            const version = PathUtils.getMtime(this.promptsFilePath);

            // Normalize/migrate each prompt
            const today = new Date().toISOString().split('T')[0];
            const normalized = prompts.map((p: any) => ({
                id: p.id,
                title: p.title,
                content: p.content,
                use_count: p.use_count ?? 0,
                last_used: p.last_used || today,
                created_at: p.created_at || p.last_used || today,
                pinned: p.pinned ?? false,
                titleSource: p.titleSource,
                order: p.order,
                meta: p.meta,
            } as Prompt));

            this.cachedPrompts = JSON.parse(JSON.stringify(normalized));
            this.cachedVersion = version;
            return { prompts: normalized, version };
        } catch (error) {
            // Corrupted file — create backup and return empty
            this.createBackup();
            return { prompts: [], version: 0 };
        }
    }

    /**
     * Get prompts (from cache or disk).
     */
    getPrompts(): Prompt[] {
        if (this.cachedPrompts) {
            return JSON.parse(JSON.stringify(this.cachedPrompts));
        }
        return this.loadPrompts().prompts;
    }

    /**
     * Get a single prompt by ID.
     */
    getPrompt(promptId: string): Prompt | undefined {
        const prompts = this.getPrompts();
        return prompts.find(p => p.id === promptId);
    }

    /**
     * Search prompts by keyword (searches title and content).
     */
    searchPrompts(query: string): Prompt[] {
        const prompts = this.getPrompts();
        const lower = query.toLowerCase();
        return prompts.filter(
            p => p.title.toLowerCase().includes(lower) || p.content.toLowerCase().includes(lower)
        );
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Save prompts to disk with optimistic locking.
     */
    savePrompts(prompts: Prompt[], expectedVersion: number): number {
        // Check for concurrent modification
        const currentVersion = PathUtils.getMtime(this.promptsFilePath);
        if (expectedVersion !== 0 && currentVersion !== 0 && currentVersion !== expectedVersion) {
            throw new OptimisticLockError();
        }

        PathUtils.writeJsonFile(this.promptsFilePath, prompts);
        const newVersion = PathUtils.getMtime(this.promptsFilePath);
        this.cachedPrompts = JSON.parse(JSON.stringify(prompts));
        this.cachedVersion = newVersion;
        return newVersion;
    }

    /**
     * Create a new prompt. Returns the created prompt.
     */
    createPrompt(title: string, content: string, options?: {
        pinned?: boolean;
        titleSource?: 'user' | 'ai';
    }): Prompt {
        const { prompts, version } = this.loadPrompts();
        const today = new Date().toISOString().split('T')[0];
        const newId = this.generatePromptId(prompts);

        const newPrompt: Prompt = {
            id: newId,
            title,
            content,
            use_count: 0,
            last_used: today,
            created_at: new Date().toISOString(),
            pinned: options?.pinned ?? false,
            titleSource: options?.titleSource,
            meta: { totalVersions: 0 },
        };

        prompts.push(newPrompt);
        this.savePrompts(prompts, version);
        return newPrompt;
    }

    /**
     * Edit prompt content and/or title.
     */
    editPrompt(promptId: string, updates: {
        title?: string;
        content?: string;
    }): Prompt {
        const { prompts, version } = this.loadPrompts();
        const idx = prompts.findIndex(p => p.id === promptId);
        if (idx === -1) {
            throw new Error(`Prompt not found: ${promptId}`);
        }

        if (updates.title !== undefined) {
            prompts[idx].title = updates.title;
        }
        if (updates.content !== undefined) {
            prompts[idx].content = updates.content;
        }

        this.savePrompts(prompts, version);
        return prompts[idx];
    }

    /**
     * Delete a prompt by ID.
     */
    deletePrompt(promptId: string): boolean {
        const { prompts, version } = this.loadPrompts();
        const idx = prompts.findIndex(p => p.id === promptId);
        if (idx === -1) {
            return false;
        }
        prompts.splice(idx, 1);
        this.savePrompts(prompts, version);
        return true;
    }

    /**
     * Toggle pin status.
     */
    togglePin(promptId: string): Prompt {
        const { prompts, version } = this.loadPrompts();
        const prompt = prompts.find(p => p.id === promptId);
        if (!prompt) {
            throw new Error(`Prompt not found: ${promptId}`);
        }
        prompt.pinned = !prompt.pinned;
        this.savePrompts(prompts, version);
        return prompt;
    }

    /**
     * Move prompt up or down in the list.
     */
    movePrompt(promptId: string, direction: 'up' | 'down'): Prompt {
        const { prompts, version } = this.loadPrompts();
        const idx = prompts.findIndex(p => p.id === promptId);
        if (idx === -1) {
            throw new Error(`Prompt not found: ${promptId}`);
        }

        if (direction === 'up' && idx > 0) {
            [prompts[idx - 1], prompts[idx]] = [prompts[idx], prompts[idx - 1]];
        } else if (direction === 'down' && idx < prompts.length - 1) {
            [prompts[idx], prompts[idx + 1]] = [prompts[idx + 1], prompts[idx]];
        } else {
            throw new Error(`Cannot move prompt ${direction}: already at boundary`);
        }

        // Update order fields
        prompts.forEach((p, i) => p.order = i);
        this.savePrompts(prompts, version);

        return prompts.find(p => p.id === promptId)!;
    }

    /**
     * Increment use count (for copy/insert operations).
     */
    incrementUseCount(promptId: string): Prompt {
        const { prompts, version } = this.loadPrompts();
        const prompt = prompts.find(p => p.id === promptId);
        if (!prompt) {
            throw new Error(`Prompt not found: ${promptId}`);
        }
        prompt.use_count++;
        prompt.last_used = new Date().toISOString().split('T')[0];
        this.savePrompts(prompts, version);
        return prompt;
    }

    /**
     * Update prompt metadata (called by version manager).
     */
    updateMeta(promptId: string, meta: { totalVersions: number; latestVersionId?: string }): void {
        const { prompts, version } = this.loadPrompts();
        const prompt = prompts.find(p => p.id === promptId);
        if (prompt) {
            prompt.meta = meta;
            this.savePrompts(prompts, version);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Clear the in-memory cache.
     */
    clearCache(): void {
        this.cachedPrompts = null;
        this.cachedVersion = 0;
    }

    private generatePromptId(existingPrompts: Prompt[]): string {
        const maxId = Math.max(0, ...existingPrompts.map(p => parseInt(p.id) || 0));
        return (maxId + 1).toString().padStart(PROMPT_CONSTANTS.ID_PADDING_LENGTH, '0');
    }

    private createBackup(): void {
        try {
            if (fs.existsSync(this.promptsFilePath)) {
                const backupPath = `${this.promptsFilePath}.backup.${Date.now()}`;
                fs.copyFileSync(this.promptsFilePath, backupPath);
                console.error(`[PromptManager] Created backup: ${backupPath}`);
            }
        } catch { /* ignore backup errors */ }
    }
}
