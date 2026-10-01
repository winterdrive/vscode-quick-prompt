import * as vscode from 'vscode';
import { MaskingEngine } from '../../privacy/maskingEngine';
import { PatternRegistry } from '../../privacy/patternRegistry';

describe('MaskingEngine', () => {
    it('registers its config-change listener as a disposable subscription', () => {
        const spy = jest.spyOn(vscode.workspace, 'onDidChangeConfiguration');
        const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

        MaskingEngine.getInstance(context);

        expect(spy).toHaveBeenCalledTimes(1);
        const disposable = spy.mock.results[0].value;
        expect(context.subscriptions).toContain(disposable);
    });

    it('logs only the error message, not the raw error object, when masking fails', async () => {
        const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
        (MaskingEngine as unknown as { instance: MaskingEngine | null }).instance = null;
        const engine = MaskingEngine.getInstance(context);

        const maskSpy = jest.spyOn(PatternRegistry.prototype, 'mask').mockImplementation(() => {
            throw new Error('boom');
        });
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await engine.maskText('hello world');

        expect(result.strategies).toEqual(['error']);
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const loggedArgs = consoleSpy.mock.calls[0];
        expect(loggedArgs).toHaveLength(1);
        expect(loggedArgs[0]).not.toBeInstanceOf(Error);
        expect(loggedArgs[0]).toBe('[MaskingEngine] Error during masking: boom');

        maskSpy.mockRestore();
        consoleSpy.mockRestore();
    });
});
