import * as vscode from 'vscode';
import { MaskingEngine } from '../../privacy/maskingEngine';

describe('MaskingEngine', () => {
    it('registers its config-change listener as a disposable subscription', () => {
        const spy = jest.spyOn(vscode.workspace, 'onDidChangeConfiguration');
        const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

        MaskingEngine.getInstance(context);

        expect(spy).toHaveBeenCalledTimes(1);
        const disposable = spy.mock.results[0].value;
        expect(context.subscriptions).toContain(disposable);
    });
});
