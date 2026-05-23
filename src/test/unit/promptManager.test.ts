import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { PromptManager, OptimisticLockError } from '../../core/PromptManager';
import { Prompt } from '../../core/types';

function makeWorkspace(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-manager-'));
    fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
    return dir;
}

function writePrompts(wsRoot: string, prompts: Prompt[]): void {
    fs.writeFileSync(
        path.join(wsRoot, '.vscode', 'prompts.json'),
        JSON.stringify(prompts, null, 2),
        'utf-8',
    );
}

describe('PromptManager', () => {
    let tmpDir: string;
    let manager: PromptManager;

    beforeEach(() => {
        tmpDir = makeWorkspace();
        manager = new PromptManager(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── loadPrompts ───────────────────────────────────────────────────────────

    describe('loadPrompts', () => {
        it('returns empty list when prompts.json does not exist', () => {
            const result = manager.loadPrompts();
            expect(result.prompts).toEqual([]);
            expect(result.version).toBe(0);
        });

        it('reads and normalizes prompts from disk', () => {
            const today = new Date().toISOString().split('T')[0];
            writePrompts(tmpDir, [
                { id: '001', title: 'T', content: 'C', use_count: 3, last_used: today, created_at: today },
            ]);
            const { prompts } = manager.loadPrompts();
            expect(prompts).toHaveLength(1);
            expect(prompts[0].title).toBe('T');
        });

        it('returns empty list and creates backup when JSON is corrupted', () => {
            const promptsPath = path.join(tmpDir, '.vscode', 'prompts.json');
            fs.writeFileSync(promptsPath, '{not json', 'utf-8');
            const { prompts } = manager.loadPrompts();
            expect(prompts).toEqual([]);
            const backups = fs.readdirSync(path.join(tmpDir, '.vscode'))
                .filter(f => f.includes('.backup.'));
            expect(backups.length).toBeGreaterThan(0);
        });

        it('normalizes missing fields with defaults', () => {
            const raw = [{ id: '001', title: 'X', content: 'Y' }];
            writePrompts(tmpDir, raw as Prompt[]);
            const { prompts } = manager.loadPrompts();
            expect(prompts[0].use_count).toBe(0);
            expect(prompts[0].pinned).toBe(false);
        });
    });

    // ── getPrompts / getPrompt ────────────────────────────────────────────────

    describe('getPrompts', () => {
        it('returns deep-cloned prompts from cache', () => {
            manager.createPrompt('A', 'a');
            const first = manager.getPrompts();
            const second = manager.getPrompts();
            expect(first).toEqual(second);
            expect(first).not.toBe(second); // deep clone, not same reference
        });
    });

    describe('getPrompt', () => {
        it('returns undefined for unknown id', () => {
            expect(manager.getPrompt('999')).toBeUndefined();
        });

        it('returns the correct prompt by id', () => {
            const created = manager.createPrompt('Hello', 'World');
            expect(manager.getPrompt(created.id)?.title).toBe('Hello');
        });
    });

    // ── searchPrompts ─────────────────────────────────────────────────────────

    describe('searchPrompts', () => {
        beforeEach(() => {
            manager.createPrompt('Fix bug', 'debug the issue');
            manager.createPrompt('Deploy', 'ship to production');
        });

        it('matches on title (case-insensitive)', () => {
            expect(manager.searchPrompts('FIX')).toHaveLength(1);
        });

        it('matches on content', () => {
            expect(manager.searchPrompts('production')).toHaveLength(1);
        });

        it('returns empty array when nothing matches', () => {
            expect(manager.searchPrompts('zzznomatch')).toHaveLength(0);
        });
    });

    // ── createPrompt ──────────────────────────────────────────────────────────

    describe('createPrompt', () => {
        it('creates a prompt and persists it', () => {
            const p = manager.createPrompt('Title', 'Content');
            expect(p.id).toBeDefined();
            expect(p.title).toBe('Title');
            expect(p.use_count).toBe(0);
            expect(manager.getPrompts()).toHaveLength(1);
        });

        it('assigns incrementing IDs with zero-padding', () => {
            const p1 = manager.createPrompt('A', 'a');
            const p2 = manager.createPrompt('B', 'b');
            expect(parseInt(p2.id)).toBe(parseInt(p1.id) + 1);
        });

        it('respects pinned option', () => {
            const p = manager.createPrompt('Pinned', 'x', { pinned: true });
            expect(p.pinned).toBe(true);
        });
    });

    // ── editPrompt ────────────────────────────────────────────────────────────

    describe('editPrompt', () => {
        it('updates title and content', () => {
            const p = manager.createPrompt('Old', 'old');
            const updated = manager.editPrompt(p.id, { title: 'New', content: 'new' });
            expect(updated.title).toBe('New');
            expect(updated.content).toBe('new');
        });

        it('throws for unknown prompt id', () => {
            expect(() => manager.editPrompt('999', { title: 'X' })).toThrow('not found');
        });

        it('updates only title when content not provided', () => {
            const p = manager.createPrompt('T', 'original content');
            manager.editPrompt(p.id, { title: 'New Title' });
            expect(manager.getPrompt(p.id)?.content).toBe('original content');
        });
    });

    // ── deletePrompt ──────────────────────────────────────────────────────────

    describe('deletePrompt', () => {
        it('removes a prompt and returns true', () => {
            const p = manager.createPrompt('Del', 'd');
            expect(manager.deletePrompt(p.id)).toBe(true);
            expect(manager.getPrompt(p.id)).toBeUndefined();
        });

        it('returns false for unknown id', () => {
            expect(manager.deletePrompt('999')).toBe(false);
        });
    });

    // ── togglePin ─────────────────────────────────────────────────────────────

    describe('togglePin', () => {
        it('toggles from unpinned to pinned', () => {
            const p = manager.createPrompt('T', 'c');
            const updated = manager.togglePin(p.id);
            expect(updated.pinned).toBe(true);
        });

        it('toggles from pinned to unpinned', () => {
            const p = manager.createPrompt('T', 'c', { pinned: true });
            expect(manager.togglePin(p.id).pinned).toBe(false);
        });

        it('throws for unknown id', () => {
            expect(() => manager.togglePin('999')).toThrow('not found');
        });
    });

    // ── movePrompt ────────────────────────────────────────────────────────────

    describe('movePrompt', () => {
        let ids: string[];

        beforeEach(() => {
            ids = [
                manager.createPrompt('A', 'a').id,
                manager.createPrompt('B', 'b').id,
                manager.createPrompt('C', 'c').id,
            ];
        });

        it('moves a prompt up', () => {
            manager.movePrompt(ids[1], 'up');
            const prompts = manager.getPrompts();
            expect(prompts[0].id).toBe(ids[1]);
            expect(prompts[1].id).toBe(ids[0]);
        });

        it('moves a prompt down', () => {
            manager.movePrompt(ids[0], 'down');
            const prompts = manager.getPrompts();
            expect(prompts[0].id).toBe(ids[1]);
            expect(prompts[1].id).toBe(ids[0]);
        });

        it('throws when moving up from first position', () => {
            expect(() => manager.movePrompt(ids[0], 'up')).toThrow('boundary');
        });

        it('throws when moving down from last position', () => {
            expect(() => manager.movePrompt(ids[2], 'down')).toThrow('boundary');
        });

        it('updates order field after move', () => {
            manager.movePrompt(ids[1], 'up');
            const prompts = manager.getPrompts();
            prompts.forEach((p, i) => expect(p.order).toBe(i));
        });
    });

    // ── incrementUseCount ─────────────────────────────────────────────────────

    describe('incrementUseCount', () => {
        it('increments use_count by 1', () => {
            const p = manager.createPrompt('T', 'c');
            const updated = manager.incrementUseCount(p.id);
            expect(updated.use_count).toBe(1);
        });

        it('updates last_used to today', () => {
            const today = new Date().toISOString().split('T')[0];
            const p = manager.createPrompt('T', 'c');
            const updated = manager.incrementUseCount(p.id);
            expect(updated.last_used).toBe(today);
        });

        it('throws for unknown id', () => {
            expect(() => manager.incrementUseCount('999')).toThrow('not found');
        });
    });

    // ── optimistic locking ────────────────────────────────────────────────────

    describe('savePrompts (optimistic locking)', () => {
        it('throws OptimisticLockError when file was modified externally', () => {
            const p = manager.createPrompt('T', 'c');
            const { version } = manager.loadPrompts();

            // Simulate external modification
            const promptsPath = path.join(tmpDir, '.vscode', 'prompts.json');
            fs.appendFileSync(promptsPath, ' ');
            const future = new Date(Date.now() + 2000);
            fs.utimesSync(promptsPath, future, future);

            expect(() =>
                manager.savePrompts([p], version),
            ).toThrow(OptimisticLockError);
        });

        it('does not throw when expectedVersion is 0 (first write)', () => {
            const p = manager.createPrompt('T', 'c');
            expect(() => manager.savePrompts([p], 0)).not.toThrow();
        });
    });

    // ── clearCache ────────────────────────────────────────────────────────────

    describe('clearCache', () => {
        it('forces re-read from disk after cache clear', () => {
            manager.createPrompt('Cached', 'x');
            manager.clearCache();

            // Write new data directly to disk
            const today = new Date().toISOString().split('T')[0];
            writePrompts(tmpDir, [
                { id: '099', title: 'FromDisk', content: 'fresh', use_count: 0, last_used: today, created_at: today },
            ]);

            const prompts = manager.getPrompts();
            expect(prompts[0].title).toBe('FromDisk');
        });
    });
});
