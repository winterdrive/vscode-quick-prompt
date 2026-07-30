import * as vscode from 'vscode';
import { PromptVersion } from '../types/versionHistory';
import { getRelativeTime } from '../utils';
import { I18n } from '../i18n';

/**
 * TreeItem representing a single version in the version history
 */
export class VersionItem extends vscode.TreeItem {
    constructor(
        public readonly promptId: string,
        public readonly version: PromptVersion,
        public readonly isCurrent: boolean
    ) {
        super(
            VersionItem.getLabel(version, isCurrent),
            vscode.TreeItemCollapsibleState.None
        );

        this.iconPath = VersionItem.getIcon(version, isCurrent);
        this.contextValue = VersionItem.getContextValue(version, isCurrent);
        this.tooltip = VersionItem.getTooltip(version, isCurrent);

        // Click behavior
        if (isCurrent) {
            this.command = {
                command: 'quickPrompt.editPrompt',
                title: 'Edit Prompt',
                arguments: [this]
            };
        } else {
            this.command = {
                command: 'quickPrompt.showVersionDiff',
                title: 'Compare with Current Version',
                arguments: [this]
            };
        }
    }

    /**
     * Generate label for version item
     */
    private static getLabel(version: PromptVersion, isCurrent: boolean): string {
        const timeText = getRelativeTime(version.timestamp);

        if (isCurrent) {
            return `${timeText} ${I18n.getMessage('version.current')}`;
        } else if (version.milestone) {
            return `📌 ${version.milestone.label} (${timeText})`;
        } else {
            return `${timeText}`;
        }
    }

    /**
     * Get icon for version item
     */
    private static getIcon(version: PromptVersion, isCurrent: boolean): vscode.ThemeIcon {
        if (isCurrent) {
            return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
        } else if (version.milestone) {
            return new vscode.ThemeIcon('tag', new vscode.ThemeColor('charts.blue'));
        }

        // Semantic icons based on change type
        switch (version.changeType) {
            case 'create':
                return new vscode.ThemeIcon('sparkle');
            case 'edit':
                return new vscode.ThemeIcon('edit');
            case 'restore':
                return new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.orange'));
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }

    /**
     * Get context value for conditional menu items
     */
    private static getContextValue(version: PromptVersion, isCurrent: boolean): string {
        if (isCurrent) {
            return 'versionItem:current';
        } else if (version.milestone) {
            return 'versionItem:milestone';
        } else {
            return 'versionItem:history';
        }
    }

    /**
     * Generate tooltip with version details
     */
    private static getTooltip(version: PromptVersion, isCurrent: boolean): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.supportHtml = true;
        // isTrusted intentionally left false: version content/milestone labels are
        // user-controlled, and isTrusted would let a crafted `[label](command:...)`
        // markdown link execute VS Code commands. Nothing here needs command links.

        // Header
        if (isCurrent) {
            tooltip.appendMarkdown(`${I18n.getMessage('tooltip.currentVersion')}\n\n`);
        } else if (version.milestone) {
            tooltip.appendMarkdown(`**📌 ${version.milestone.label}**\n\n`);
        } else {
            tooltip.appendMarkdown(`${I18n.getMessage('tooltip.historyVersion')}\n\n`);
        }

        // Timestamp
        const date = new Date(version.timestamp);
        tooltip.appendMarkdown(`⏰ ${date.toLocaleString()}\n\n`);

        // Change type
        const changeTypeLabel = I18n.getMessage(`tooltip.changeType.${version.changeType}`);
        tooltip.appendMarkdown(`🔧 ${changeTypeLabel}\n\n`);

        // Content preview (first 100 characters)
        const preview = version.content.substring(0, 100);
        tooltip.appendMarkdown('---\n\n');
        tooltip.appendMarkdown(`${I18n.getMessage('tooltip.preview')}\n\n`);
        tooltip.appendCodeblock(preview + (version.content.length > 100 ? '...' : ''), 'text');

        return tooltip;
    }
}
