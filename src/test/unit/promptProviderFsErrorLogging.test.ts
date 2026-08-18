import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PromptProvider } from '../../promptProvider';
import { VersionHistoryService } from '../../services/VersionHistoryService';

// Regression test for PR #67: PromptProvider catch blocks used to log the raw
// fs error object, whose message embeds the full absolute workspace path
// (e.g. "EISDIR: illegal operation on a directory, open 'C:\Users\...\prompts.json'").
// The fix routes every such catch block through formatFsErrorForLog(), which
// keeps only the error code/name and drops the path.
describe('PromptProvider fs error logging (PR #67)', () => {
    let tmpDir: string;
    let promptsJsonPath: string;
    let consoleErrorSpy: jest.SpyInstance;

    function makeContext(): vscode.ExtensionContext {
        const context = new (vscode as any).ExtensionContext();
        const state = new Map<string, unknown>();
        context.workspaceState = {
            get: jest.fn((key: string, defaultValue?: unknown) => state.has(key) ? state.get(key) : defaultValue),
            update: jest.fn((key: string, value: unknown) => {
                state.set(key, value);
                return Promise.resolve();
            }),
            keys: jest.fn(() => Array.from(state.keys()))
        };
        return context;
    }

    function loggedText(): string {
        return consoleErrorSpy.mock.calls
            .flat()
            .map(arg => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)))
            .join('\n');
    }

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-provider-fserr-'));
        fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
        promptsJsonPath = path.join(tmpDir, '.vscode', 'prompts.json');
        // Start with a valid, loadable prompts.json so the initial refresh()
        // succeeds and the workspace is NOT marked as failed-to-load.
        fs.writeFileSync(promptsJsonPath, '[]', 'utf8');

        (vscode.workspace as any).workspaceFolders = [
            { name: 'SecretProject', uri: vscode.Uri.file(tmpDir) }
        ];
        (vscode.window as any).activeTextEditor = undefined;
        jest.clearAllMocks();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        (vscode.workspace as any).workspaceFolders = undefined;
        (vscode.window as any).activeTextEditor = undefined;
    });

    it('logs only the fs error code, not the full workspace path, when saving prompts fails', async () => {
        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));

        // Load succeeds normally while prompts.json is still a real file.
        await provider.refresh();

        // Simulate the prompts.json path becoming unwritable (e.g. replaced by a
        // directory) after a successful load, so the next save hits the fs error
        // catch block in savePrompts() rather than the "failed to load" guard.
        fs.rmSync(promptsJsonPath, { force: true });
        fs.mkdirSync(promptsJsonPath);

        await expect(provider.addPromptWithOption('Prompt A', 'content A', true)).rejects.toThrow();

        expect(consoleErrorSpy).toHaveBeenCalled();
        const text = loggedText();

        // The absolute workspace path must never appear in the log output.
        expect(text).not.toContain(tmpDir);
        // The useful error code should still be present.
        expect(text).toMatch(/EISDIR/);
    });
});
