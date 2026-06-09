import * as fs from 'fs';
import * as path from 'path';
import * as realOs from 'os';
import { ClipboardManager } from '../../ClipboardManager';
import * as vscode from 'vscode';
import { env } from 'vscode';

jest.mock('os', () => ({
    ...jest.requireActual('os'),
    homedir: jest.fn(),
}));
import * as os from 'os';

jest.useFakeTimers();

const readText = env.clipboard.readText as jest.Mock;
const homedirMock = os.homedir as jest.Mock;

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i++) { await Promise.resolve(); }
}

function makeContext(): vscode.ExtensionContext {
    return new (vscode as any).ExtensionContext();
}

describe('ClipboardManager.checkClipboard', () => {
    let tmpDir: string;
    let manager: ClipboardManager;

    beforeEach(async () => {
        tmpDir = fs.mkdtempSync(path.join(realOs.tmpdir(), 'cm-test-'));
        homedirMock.mockReturnValue(tmpDir);
        readText.mockReset().mockResolvedValue('');
        manager = new ClipboardManager(makeContext());
        await flushMicrotasks();
    });

    afterEach(() => {
        manager.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        jest.clearAllMocks();
    });

    // ── before history loaded ─────────────────────────────────────────────────

    it('returns false before history loads', async () => {
        const fresh = new ClipboardManager(makeContext());
        // no await — historyLoaded is still false
        const result = await fresh.checkClipboard('external');
        expect(result).toBe(false);
        fresh.dispose();
    });

    // ── valid new content ─────────────────────────────────────────────────────

    it('returns true and adds content when clipboard has valid new text', async () => {
        readText.mockResolvedValue('Hello World valid content');
        const result = await manager.checkClipboard('external');
        expect(result).toBe(true);
        expect(manager.getHistory()).toHaveLength(1);
        expect(manager.getHistory()[0].content).toBe('Hello World valid content');
    });

    it('records the correct source when called with vscode source', async () => {
        readText.mockResolvedValue('Some text copied from editor here');
        await manager.checkClipboard('vscode');
        expect(manager.getHistory()[0].source).toBe('vscode');
    });

    // ── duplicate / recent history ────────────────────────────────────────────

    it('returns false when content is same as lastClipboard (isDuplicate)', async () => {
        readText.mockResolvedValue('Unique long content string here');
        await manager.checkClipboard('external');
        const second = await manager.checkClipboard('external');
        expect(second).toBe(false);
        expect(manager.getHistory()).toHaveLength(1);
    });

    it('returns false when content is already in recent history', async () => {
        readText.mockResolvedValue('First item long enough here');
        await manager.checkClipboard('external');
        readText.mockResolvedValue('Second item long enough here');
        await manager.checkClipboard('external');
        readText.mockResolvedValue('First item long enough here');
        const result = await manager.checkClipboard('external');
        expect(result).toBe(false);
        expect(manager.getHistory()).toHaveLength(2);
    });

    // ── content filters ───────────────────────────────────────────────────────

    it('returns false when content is shorter than minLength (10 chars)', async () => {
        readText.mockResolvedValue('short');
        const result = await manager.checkClipboard('external');
        expect(result).toBe(false);
        expect(manager.getHistory()).toHaveLength(0);
    });

    it('returns false when content is pure numbers', async () => {
        readText.mockResolvedValue('1234567890');
        const result = await manager.checkClipboard('external');
        expect(result).toBe(false);
        expect(manager.getHistory()).toHaveLength(0);
    });

    it('returns false when content is empty', async () => {
        readText.mockResolvedValue('');
        const result = await manager.checkClipboard('external');
        expect(result).toBe(false);
        expect(manager.getHistory()).toHaveLength(0);
    });

    // ── throwOnError ──────────────────────────────────────────────────────────

    it('returns false silently when clipboard read fails (throwOnError=false)', async () => {
        readText.mockRejectedValue(new Error('Permission denied'));
        const result = await manager.checkClipboard('external', false);
        expect(result).toBe(false);
    });

    it('throws when clipboard read fails and throwOnError=true', async () => {
        readText.mockRejectedValue(new Error('Permission denied'));
        await expect(manager.checkClipboard('external', true)).rejects.toThrow('Permission denied');
    });
});
