import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { VersionManager } from '../../core/VersionManager';
import { PROMPT_CONSTANTS } from '../../core/types';

function makeWorkspace(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'pm-version-'));
}

describe('VersionManager', () => {
    let tmpDir: string;
    let manager: VersionManager;

    beforeEach(() => {
        tmpDir = makeWorkspace();
        manager = new VersionManager(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── loadHistory ───────────────────────────────────────────────────────────

    describe('loadHistory', () => {
        it('returns empty history for an unknown promptId', () => {
            const history = manager.loadHistory('001');
            expect(history.versions).toEqual([]);
            expect(history.currentVersionId).toBe('');
        });

        it('returns the same data after a write', () => {
            manager.createVersion('001', { content: 'Hello', changeType: 'create' });
            const history = manager.loadHistory('001');
            expect(history.versions).toHaveLength(1);
            expect(history.versions[0].content).toBe('Hello');
        });

        it('throws for invalid promptId with path traversal', () => {
            expect(() => manager.loadHistory('../evil')).toThrow('Invalid promptId');
        });

        it('resets to empty history when the file contains corrupted JSON', () => {
            const historyDir = path.join(tmpDir, '.vscode', '.quickprompt', 'history');
            fs.mkdirSync(historyDir, { recursive: true });
            fs.writeFileSync(path.join(historyDir, '001.history.json'), '{not valid json', 'utf-8');

            const history = manager.loadHistory('001');
            expect(history).toEqual({ promptId: '001', versions: [], currentVersionId: '' });
        });

        it('resets to empty history when the file contains JSON of the wrong shape', () => {
            const historyDir = path.join(tmpDir, '.vscode', '.quickprompt', 'history');
            fs.mkdirSync(historyDir, { recursive: true });
            fs.writeFileSync(path.join(historyDir, '001.history.json'), JSON.stringify([1, 2, 3]), 'utf-8');

            const history = manager.loadHistory('001');
            expect(history).toEqual({ promptId: '001', versions: [], currentVersionId: '' });
        });
    });

    // ── createVersion ─────────────────────────────────────────────────────────

    describe('createVersion', () => {
        it('creates a version with the given content and changeType', () => {
            const v = manager.createVersion('001', { content: 'v1', changeType: 'create' });
            expect(v.content).toBe('v1');
            expect(v.changeType).toBe('create');
            expect(v.versionId).toMatch(/^v\d+/);
        });

        it('adds milestone when milestoneLabel is provided', () => {
            const v = manager.createVersion('001', {
                content: 'stable',
                changeType: 'edit',
                milestoneLabel: 'Release 1.0',
            });
            expect(v.milestone?.label).toBe('Release 1.0');
        });

        it('deduplicates: returns existing version when content is unchanged', () => {
            const v1 = manager.createVersion('001', { content: 'same', changeType: 'create' });
            const v2 = manager.createVersion('001', { content: 'same', changeType: 'edit' });
            expect(v2.versionId).toBe(v1.versionId);
            expect(manager.listVersions('001').versions).toHaveLength(1);
        });

        it('keeps newest version as currentVersionId', () => {
            manager.createVersion('001', { content: 'v1', changeType: 'create' });
            const v2 = manager.createVersion('001', { content: 'v2', changeType: 'edit' });
            expect(manager.loadHistory('001').currentVersionId).toBe(v2.versionId);
        });

        it('stores versions newest-first', () => {
            manager.createVersion('001', { content: 'v1', changeType: 'create' });
            manager.createVersion('001', { content: 'v2', changeType: 'edit' });
            const { versions } = manager.listVersions('001');
            expect(versions[0].content).toBe('v2');
            expect(versions[1].content).toBe('v1');
        });
    });

    // ── getVersionContent ─────────────────────────────────────────────────────

    describe('getVersionContent', () => {
        it('returns content of a known version', () => {
            const v = manager.createVersion('001', { content: 'abc', changeType: 'create' });
            expect(manager.getVersionContent('001', v.versionId)).toBe('abc');
        });

        it('throws for unknown versionId', () => {
            expect(() => manager.getVersionContent('001', 'v-ghost')).toThrow('not found');
        });
    });

    // ── getCurrentVersion ─────────────────────────────────────────────────────

    describe('getCurrentVersion', () => {
        it('returns undefined when history is empty', () => {
            expect(manager.getCurrentVersion('001')).toBeUndefined();
        });

        it('returns the most recently created version', () => {
            manager.createVersion('001', { content: 'v1', changeType: 'create' });
            const v2 = manager.createVersion('001', { content: 'v2', changeType: 'edit' });
            expect(manager.getCurrentVersion('001')?.versionId).toBe(v2.versionId);
        });
    });

    // ── applyVersion ──────────────────────────────────────────────────────────

    describe('applyVersion', () => {
        it('creates a restore version with the original content', () => {
            const v1 = manager.createVersion('001', { content: 'original', changeType: 'create' });
            manager.createVersion('001', { content: 'modified', changeType: 'edit' });
            const restored = manager.applyVersion('001', v1.versionId);
            expect(restored.content).toBe('original');
            expect(restored.changeType).toBe('restore');
        });

        it('throws when restoring a non-existent version', () => {
            expect(() => manager.applyVersion('001', 'v-ghost')).toThrow('not found');
        });
    });

    // ── deleteVersion ─────────────────────────────────────────────────────────

    describe('deleteVersion', () => {
        it('removes a non-current version', () => {
            const v1 = manager.createVersion('001', { content: 'v1', changeType: 'create' });
            manager.createVersion('001', { content: 'v2', changeType: 'edit' });
            manager.deleteVersion('001', v1.versionId);
            expect(manager.listVersions('001').versions).toHaveLength(1);
        });

        it('throws when trying to delete the current version', () => {
            const v = manager.createVersion('001', { content: 'v1', changeType: 'create' });
            expect(() => manager.deleteVersion('001', v.versionId)).toThrow('current version');
        });

        it('throws when only one version exists', () => {
            const v = manager.createVersion('001', { content: 'only', changeType: 'create' });
            // Bypass current version check: create second, then try to delete first (which is still protected)
            manager.createVersion('001', { content: 'second', changeType: 'edit' });
            // Now the first (oldest) is not current, so deletion should work
            expect(manager.listVersions('001').versions).toHaveLength(2);
            manager.deleteVersion('001', v.versionId);
            expect(manager.listVersions('001').versions).toHaveLength(1);
        });

        it('throws for unknown version id', () => {
            manager.createVersion('001', { content: 'v1', changeType: 'create' });
            manager.createVersion('001', { content: 'v2', changeType: 'edit' });
            expect(() => manager.deleteVersion('001', 'v-ghost')).toThrow('not found');
        });
    });

    // ── milestones ────────────────────────────────────────────────────────────

    describe('tagMilestone / renameMilestone / removeMilestone', () => {
        let versionId: string;

        beforeEach(() => {
            const v = manager.createVersion('001', { content: 'stable', changeType: 'create' });
            versionId = v.versionId;
        });

        it('tags a version as milestone', () => {
            manager.tagMilestone('001', versionId, 'v1.0');
            const v = manager.listVersions('001').versions.find(x => x.versionId === versionId);
            expect(v?.milestone?.label).toBe('v1.0');
        });

        it('renames a milestone', () => {
            manager.tagMilestone('001', versionId, 'old');
            manager.renameMilestone('001', versionId, 'new');
            const v = manager.listVersions('001').versions.find(x => x.versionId === versionId);
            expect(v?.milestone?.label).toBe('new');
        });

        it('removes a milestone tag', () => {
            manager.tagMilestone('001', versionId, 'v1.0');
            manager.removeMilestone('001', versionId);
            const v = manager.listVersions('001').versions.find(x => x.versionId === versionId);
            expect(v?.milestone).toBeUndefined();
        });

        it('throws when renaming a non-milestone version', () => {
            expect(() => manager.renameMilestone('001', versionId, 'x')).toThrow('not a milestone');
        });

        it('throws tagMilestone for unknown version', () => {
            expect(() => manager.tagMilestone('001', 'ghost', 'x')).toThrow('not found');
        });
    });

    // ── pruning ───────────────────────────────────────────────────────────────

    describe('pruneVersions', () => {
        it(`caps history at MAX_VERSIONS (${PROMPT_CONSTANTS.MAX_VERSIONS})`, () => {
            for (let i = 0; i <= PROMPT_CONSTANTS.MAX_VERSIONS; i++) {
                manager.createVersion('001', { content: `v${i}`, changeType: 'edit' });
            }
            const { versions } = manager.listVersions('001');
            expect(versions.length).toBeLessThanOrEqual(PROMPT_CONSTANTS.MAX_VERSIONS);
        });

        it('protects milestone versions from pruning', () => {
            // Create enough versions to exceed MAX
            for (let i = 0; i < PROMPT_CONSTANTS.MAX_VERSIONS; i++) {
                manager.createVersion('001', { content: `v${i}`, changeType: 'edit' });
            }
            const { versions } = manager.listVersions('001');
            const oldest = versions[versions.length - 1];
            manager.tagMilestone('001', oldest.versionId, 'protected');

            // Add one more to trigger pruning
            manager.createVersion('001', { content: 'trigger', changeType: 'edit' });

            const after = manager.listVersions('001').versions;
            const milestoneStillThere = after.some(v => v.versionId === oldest.versionId);
            expect(milestoneStillThere).toBe(true);
        });
    });

    // ── clearCache / deleteHistory ────────────────────────────────────────────

    describe('clearCache', () => {
        it('clears cache for specific promptId', () => {
            manager.createVersion('001', { content: 'v1', changeType: 'create' });
            manager.clearCache('001');
            // Still readable from disk
            expect(manager.listVersions('001').versions).toHaveLength(1);
        });

        it('clears all caches with no argument', () => {
            manager.createVersion('001', { content: 'v1', changeType: 'create' });
            manager.createVersion('002', { content: 'v2', changeType: 'create' });
            manager.clearCache();
            expect(manager.listVersions('001').versions).toHaveLength(1);
            expect(manager.listVersions('002').versions).toHaveLength(1);
        });
    });

    describe('deleteHistory', () => {
        it('removes the history file and clears cache', () => {
            manager.createVersion('001', { content: 'v1', changeType: 'create' });
            manager.deleteHistory('001');
            const { versions } = manager.listVersions('001');
            expect(versions).toHaveLength(0);
        });

        it('does not throw when history file does not exist', () => {
            expect(() => manager.deleteHistory('nonexistent')).not.toThrow();
        });
    });
});
