import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { I18n } from '../../i18n';

/**
 * Regression tests for PR #70: "avoid logging raw error object on i18n
 * language file load failure" (src/i18n.ts, loadLanguageFile).
 *
 * These tests exercise the failure path of I18n.loadLanguageFile by pointing
 * ExtensionContext.extensionUri at a temp directory that only contains an
 * `en.json` locale file (no file for the "unsupported" locale requested).
 * The mocked vscode.workspace.fs.readFile (src/test/__mocks__/vscode.ts)
 * delegates to the real Node fs module, so requesting a missing locale file
 * naturally rejects with an ENOENT-derived error, exactly like the failure
 * this PR addressed.
 */
describe('I18n', () => {
    let tmpDir: string;
    let context: vscode.ExtensionContext;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-i18n-'));
        fs.mkdirSync(path.join(tmpDir, 'i18n'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpDir, 'i18n', 'en.json'),
            JSON.stringify({ 'message.greeting': 'Hello {0}' })
        );

        context = { extensionUri: vscode.Uri.file(tmpDir) } as vscode.ExtensionContext;

        // Reset the module-level singleton state between tests (private
        // statics, accessed via `as any` since there is no public reset API).
        (I18n as unknown as { isInitialized: boolean }).isInitialized = false;
        (I18n as unknown as { messages: Record<string, string> }).messages = {};

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        (vscode.env as { language: string }).language = 'en';
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('does not throw when the requested locale file is missing', async () => {
        (vscode.env as { language: string }).language = 'xx-unsupported';

        await expect(I18n.initialize(context)).resolves.toBeUndefined();
    });

    it('falls back to English when the requested locale file fails to load', async () => {
        (vscode.env as { language: string }).language = 'xx-unsupported';

        await I18n.initialize(context);

        expect(I18n.isReady()).toBe(true);
        expect(I18n.getMessage('message.greeting', 'World')).toBe('Hello World');
    });

    it('does not log the raw error object/stack for a load failure, only the locale', async () => {
        (vscode.env as { language: string }).language = 'xx-unsupported';

        await I18n.initialize(context);

        const failureCalls = consoleLogSpy.mock.calls.filter(call =>
            typeof call[0] === 'string' && call[0].includes('Failed to load xx-unsupported.json')
        );

        expect(failureCalls.length).toBeGreaterThan(0);

        for (const call of failureCalls) {
            // The fix logs only the message string, no second "error" argument.
            expect(call).toHaveLength(1);

            // No argument in the call should be an Error instance or otherwise
            // carry a stack trace / raw error payload.
            for (const arg of call) {
                expect(arg instanceof Error).toBe(false);
                if (typeof arg === 'string') {
                    expect(arg).not.toMatch(/\bat .*\(.*:\d+:\d+\)/); // stack trace frame
                    expect(arg.toLowerCase()).not.toContain('enoent');
                }
            }
        }

        // Also confirm console.error was never used to dump the raw error for
        // this path (initialize's own top-level catch is a separate concern).
        for (const call of consoleErrorSpy.mock.calls) {
            for (const arg of call) {
                expect(arg instanceof Error).toBe(false);
            }
        }
    });
});
