import * as vscode from 'vscode';
import { PromptHoverProvider } from '../../promptHoverProvider';
import { Prompt } from '../../core/types';

function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
    return {
        id: 'testid',
        title: 'My Prompt',
        content: 'Some prompt content',
        use_count: 0,
        last_used: new Date().toISOString(),
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

describe('PromptHoverProvider', () => {
    it('produces a hover MarkdownString with isTrusted falsy (regression: PR #68 command-link trust)', () => {
        const provider = new PromptHoverProvider();
        provider.updatePrompts([makePrompt()]);

        const document = {
            uri: vscode.Uri.parse('quickprompt:/testid.md'),
        } as unknown as vscode.TextDocument;

        const hover = provider.provideHover(
            document,
            {} as vscode.Position,
            {} as vscode.CancellationToken
        ) as vscode.Hover;

        expect(hover).toBeTruthy();
        const md = hover.contents as unknown as vscode.MarkdownString;
        expect(md.isTrusted).toBeFalsy();
        expect(md.isTrusted).not.toBe(true);
    });

    it('never sets isTrusted to true even for a title crafted to look like a command link', () => {
        const provider = new PromptHoverProvider();
        provider.updatePrompts([
            makePrompt({ title: '[Click me](command:workbench.action.terminal.new)' }),
        ]);

        const document = {
            uri: vscode.Uri.parse('quickprompt:/testid.md'),
        } as unknown as vscode.TextDocument;

        const hover = provider.provideHover(
            document,
            {} as vscode.Position,
            {} as vscode.CancellationToken
        ) as vscode.Hover;

        const md = hover.contents as unknown as vscode.MarkdownString;
        expect(md.isTrusted).toBeFalsy();
    });
});
