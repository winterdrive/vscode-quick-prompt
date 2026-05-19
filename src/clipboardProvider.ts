import * as vscode from 'vscode';
import { I18n } from './i18n';
import { ClipboardManager, ClipboardHistoryItem } from './ClipboardManager';
import { getRelativeTime } from './utils';

// 剪貼簿歷史項目（用於 TreeView）
export class ClipboardTreeItem extends vscode.TreeItem {
    constructor(public readonly item: ClipboardHistoryItem) {
        super(item.preview, vscode.TreeItemCollapsibleState.None);

        const relativeTime = getRelativeTime(item.timestamp);
        // 使用視覺寬度截斷，確保多語系字元呈現一致寬度
        this.label = `${item.preview}`;
        this.description = `${relativeTime}`;
        const MAX_PREVIEW = 300;
        const contentPreview = item.content.length > MAX_PREVIEW
            ? `${item.content.slice(0, MAX_PREVIEW)}...`
            : item.content;
        const metaLine = `${I18n.getMessage('clipboard.source.' + item.source)}  |  ${I18n.getMessage('clipboard.chars', item.length.toString())}  |  ${new Date(item.timestamp).toLocaleString()}`;
        this.tooltip = `${metaLine}\n\n${contentPreview}`;
        this.contextValue = 'clipboardItem';
        this.iconPath = new vscode.ThemeIcon('history', new vscode.ThemeColor('descriptionForeground'));

        // 點擊時複製
        this.command = {
            command: 'promptSniper.copyClipboardItem',
            title: 'Copy',
            arguments: [this]
        };
    }
}

/**
 * ClipboardProvider - 提供剪貼簿歷史的 TreeDataProvider
 */
export class ClipboardProvider implements vscode.TreeDataProvider<ClipboardTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ClipboardTreeItem | undefined | null | void> = new vscode.EventEmitter<ClipboardTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ClipboardTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private clipboardManager?: ClipboardManager;

    constructor() { }

    /**
     * 設定 ClipboardManager 引用
     */
    setClipboardManager(manager: ClipboardManager) {
        this.clipboardManager = manager;

        // 監聽剪貼簿歷史變化
        manager.onHistoryChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ClipboardTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ClipboardTreeItem): Thenable<ClipboardTreeItem[]> {
        // 如果 clipboardManager 未設定或功能未啟用，返回空陣列
        if (!this.clipboardManager) {
            return Promise.resolve([]);
        }

        const config = vscode.workspace.getConfiguration('quickPrompt.clipboardHistory');
        const clipboardEnabled = config.get<boolean>('enabled', true);

        if (!clipboardEnabled) {
            return Promise.resolve([]);
        }

        // 沒有子元素，直接返回歷史記錄
        if (!element) {
            const history = this.clipboardManager.getHistory();
            return Promise.resolve(history.map(item => new ClipboardTreeItem(item)));
        }

        return Promise.resolve([]);
    }
}
