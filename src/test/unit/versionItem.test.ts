import * as vscode from 'vscode';
import { VersionItem } from '../../treeItems/VersionItem';
import { PromptVersion } from '../../types/versionHistory';

function makeVersion(overrides: Partial<PromptVersion> = {}): PromptVersion {
    return {
        versionId: 'v1',
        content: 'Some version content',
        timestamp: Date.now(),
        changeType: 'edit',
        ...overrides,
    };
}

describe('VersionItem', () => {
    it('produces a tooltip MarkdownString with isTrusted falsy (regression: PR #68 command-link trust)', () => {
        const item = new VersionItem('promptA', makeVersion(), false);

        const tooltip = item.tooltip as unknown as vscode.MarkdownString;
        expect(tooltip).toBeTruthy();
        expect(tooltip.isTrusted).toBeFalsy();
        expect(tooltip.isTrusted).not.toBe(true);
    });

    it('never sets isTrusted to true even for a milestone label crafted to look like a command link', () => {
        const item = new VersionItem(
            'promptA',
            makeVersion({
                milestone: {
                    label: '[Click me](command:workbench.action.terminal.new)',
                    createdAt: Date.now(),
                },
            }),
            false
        );

        const tooltip = item.tooltip as unknown as vscode.MarkdownString;
        expect(tooltip.isTrusted).toBeFalsy();
    });
});
