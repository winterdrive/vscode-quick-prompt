import * as vscode from 'vscode';
import * as path from 'path';

class ClipboardPreviewProvider implements vscode.TextDocumentContentProvider {
    static readonly scheme = 'quickprompt-preview';
    static readonly uri = vscode.Uri.parse(`${ClipboardPreviewProvider.scheme}://clipboard/preview`);

    private _content = '';
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    update(content: string) {
        this._content = content;
        this._onDidChange.fire(ClipboardPreviewProvider.uri);
    }

    provideTextDocumentContent(): string {
        return this._content;
    }
}

import { PromptProvider, PromptItem } from './promptProvider';
import { ClipboardProvider, ClipboardTreeItem } from './clipboardProvider';
import { ClipboardManager } from './ClipboardManager';
import { PromptFileSystemProvider } from './promptFileSystem';
import { I18n } from './i18n';
import { getPromptQuickPickIcon, sortPrompts, generateAutoTitle, getRelativeTime, executeWithConfirmation } from './utils';
import { AIEngine } from './ai/aiEngine';
import { OpenAICompatibleClient } from './ai/openAIClient';
import { TitleGenerationService } from './services/titleGenerationService';
import { VersionHistoryService } from './services/VersionHistoryService';
import { VersionItem } from './treeItems/VersionItem';
import * as versionCommands from './commands/versionCommands';
import { MaskingEngine } from './privacy/maskingEngine';
import { PatternEngine } from './privacy/masking/patternEngine';

/**
 * Register all prompt-related commands
 */
export function registerPromptCommands(
    context: vscode.ExtensionContext,
    promptProvider: PromptProvider,
    clipboardManager: ClipboardManager,
    fileSystemProvider: PromptFileSystemProvider,
    aiEngine: AIEngine
): void {
    // 初始化標題生成服務
    const titleGenService = new TitleGenerationService(aiEngine);

    // 搜尋 Prompt（整合剪貼簿歷史）
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.search', async () => {
            await handleSearch(promptProvider, clipboardManager);
        })
    );

    // 選擇 multi-root 顯示範圍
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.selectScope', async () => {
            await handleSelectScope(promptProvider);
        })
    );

    // 複製 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.insert', async (item: PromptItem) => {
            await handleInsertPrompt(item, promptProvider);
        })
    );

    // 新增 Prompt - 從 panel 建立空白內容並直接開啟編輯器
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.addPrompt', async () => {
            await handleAddPrompt(promptProvider, fileSystemProvider);
        })
    );

    // 新增 Prompt - 自訂標題模式
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.addPromptWithTitle', async () => {
            await handleAddPromptWithTitle(promptProvider, titleGenService);
        })
    );

    // 新增 Prompt - Silent Capture (無干擾捕捉)
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.silentAdd', async () => {
            await handleSilentAdd(promptProvider, titleGenService);
        })
    );

    // 刪除 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.deletePrompt', async (item: PromptItem) => {
            const message = I18n.getMessage('confirm.deletePrompt', item.prompt.title);
            const confirmLabel = I18n.getMessage('confirm.yes');

            await executeWithConfirmation(
                message,
                confirmLabel,
                async () => {
                    await promptProvider.deletePrompt(item);
                }
            );
        })
    );

    // 實體遮罩 (Mask)
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.maskPrompt', async (item: PromptItem) => {
            if (!item?.prompt?.id) { return; }
            const engine = MaskingEngine.getInstance(context);
            const result = await engine.maskText(item.prompt.content, {
                enablePatterns: true,
                silent: true
            });
            if (result.tokens.length === 0) {
                vscode.window.setStatusBarMessage(`防護引擎未運作：未找到可遮罩的項目，或功能已關閉`, 3000);
                return;
            }
            // 建立 tokenMap：{ "[EMAIL-1]": "user@real.com" }
            const tokenMap: Record<string, string> = {};
            for (const token of result.tokens) {
                tokenMap[token.maskedValue] = token.originalValue;
            }
            await promptProvider.maskPromptContent(item.prompt.id, result.maskedText, tokenMap);
            vscode.window.setStatusBarMessage(`🔒 已實體遮罩 ${result.tokens.length} 處機密資訊`, 3000);
        })
    );

    // 實體還原 (Unmask)
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.unmaskPrompt', async (item: PromptItem) => {
            if (!item?.prompt?.id) { return; }
            if (!item.prompt.privacyMeta) {
                const hasLegacyMask = PatternEngine.hasMaskedTokens(item.prompt.content);
                vscode.window.setStatusBarMessage(
                    hasLegacyMask
                        ? `此項目僅有遮罩標記，缺少對照表，無法還原`
                        : `找不到遮罩對照表，無法還原`,
                    3000
                );
                return;
            }
            const success = await promptProvider.unmaskPromptContent(item.prompt.id);
            vscode.window.setStatusBarMessage(success ? `🔓 內容已成功還原為原始明碼` : `還原失敗`, 3000);
        })
    );

    // 忽略 Prompt 隱私警告
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.ignorePromptWarning', async (item: PromptItem) => {
            if (item?.prompt?.id) {
                await promptProvider.ignorePromptWarning(item.prompt.id);
            }
        })
    );

    // 重新啟用 Prompt 隱私警告
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.restorePromptWarning', async (item: PromptItem) => {
            if (item?.prompt?.id) {
                await promptProvider.restorePromptWarning(item.prompt.id);
            }
        })
    );

    // 釘選/取消釘選 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.togglePin', async (item: PromptItem) => {
            await promptProvider.togglePin(item);
        })
    );

    // 重新整理
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.refresh', async () => {
            await promptProvider.refresh();
            vscode.window.showInformationMessage(I18n.getMessage('message.refreshed'));
        })
    );

    // 編輯 Prompt (使用虛擬檔案系統)
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.editPrompt', async (item: PromptItem) => {
            await handleEditPrompt(item, fileSystemProvider);
        })
    );

    // 重新命名 Prompt 標題
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.renamePrompt', async (item: PromptItem) => {
            await handleRenamePrompt(item, promptProvider);
        })
    );

    // 上移 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.moveUp', async (item: PromptItem) => {
            await promptProvider.moveUp(item);
        })
    );

    // 下移 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.moveDown', async (item: PromptItem) => {
            await promptProvider.moveDown(item);
        })
    );
}

/**
 * Register all clipboard-related commands
 */
export function registerClipboardCommands(
    context: vscode.ExtensionContext,
    promptProvider: PromptProvider,
    clipboardManager: ClipboardManager,
    fileSystemProvider: PromptFileSystemProvider,
    aiEngine: AIEngine,
    titleGenService: TitleGenerationService,
    maskingEngine?: MaskingEngine,
    clipboardProvider?: ClipboardProvider
): void {
    // 複製剪貼簿歷史項目
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.copyClipboardItem', async (item: ClipboardTreeItem) => {
            await handleCopyClipboardItem(item);
        })
    );

    // 固定剪貼簿項目到 Prompts（無需輸入標題，靜默模式）
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.pinClipboardItem', async (item: ClipboardTreeItem) => {
            await handlePinClipboardItem(item, promptProvider, clipboardManager, titleGenService);
        })
    );

    // 查看剪貼簿項目完整內容（唯讀暫時文件）
    const previewProvider = new ClipboardPreviewProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(ClipboardPreviewProvider.scheme, previewProvider)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.viewClipboardItem', async (item: ClipboardTreeItem) => {
            await handleViewClipboardItem(item, previewProvider);
        })
    );

    // 從歷史移除剪貼簿項目
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.removeClipboardItem', async (item: ClipboardTreeItem) => {
            await handleRemoveClipboardItem(item, clipboardManager);
        })
    );

    // 清空剪貼簿歷史
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.clearClipboardHistory', async () => {
            await handleClearClipboardHistory(clipboardManager);
        })
    );

    // 清除 AI 模型快取
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.clearModelCache', async () => {
            await handleClearModelCache(aiEngine);
        })
    );

    // 測試 AI 連線（僅 openai-compatible 有意義）
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.testAIConnection', async () => {
            await handleTestAIConnection(aiEngine);
        })
    );

    // 重新整理剪貼簿歷史
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.refreshClipboard', async () => {
            try {
                let isNew = false;
                if (clipboardManager) {
                    isNew = await clipboardManager.checkClipboard('external', true);
                }
                
                if (clipboardProvider) {
                    clipboardProvider.refresh();
                }

                vscode.window.showInformationMessage(
                    I18n.getMessage('message.clipboardRefreshed')
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(
                    I18n.getMessage('message.clipboardRefreshFailed', error?.message || String(error))
                );
            }
        })
    );
}

/**
 * Register all version history commands
 */
export function registerVersionCommands(
    context: vscode.ExtensionContext,
    promptProvider: PromptProvider,
    versionHistoryService: VersionHistoryService
): void {
    // Show version diff
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.showVersionDiff', async (item: VersionItem) => {
            await versionCommands.handleShowVersionDiff(item, versionHistoryService);
        })
    );

    // Apply Version Command (Soft Checkout)
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.applyVersion', (item: VersionItem) => {
            versionCommands.handleApplyVersion(item, promptProvider);
        })
    );

    // Tag milestone
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.tagMilestone', async (item: VersionItem) => {
            await versionCommands.handleTagMilestone(item, versionHistoryService, promptProvider);
        })
    );

    // Rename milestone
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.renameMilestone', async (item: VersionItem) => {
            await versionCommands.handleRenameMilestone(item, versionHistoryService, promptProvider);
        })
    );

    // Remove milestone
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.removeMilestone', async (item: VersionItem) => {
            await versionCommands.handleRemoveMilestone(item, versionHistoryService, promptProvider);
        })
    );

    // Delete version
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.deleteVersion', async (item: VersionItem) => {
            await versionCommands.handleDeleteVersion(item, versionHistoryService, promptProvider);
        })
    );

    // Copy version content
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.copyVersionContent', async (item: VersionItem) => {
            await versionCommands.handleCopyVersionContent(item, promptProvider);
        })
    );
}



// ==================== Command Handlers ====================

/**
 * Handle search command - unified search for prompts and clipboard history
 */
async function handleSearch(
    promptProvider: PromptProvider,
    clipboardManager: ClipboardManager
): Promise<void> {
    const prompts = promptProvider.getVisiblePrompts();
    const clipboardHistory = clipboardManager.getHistory();

    interface QuickPickItemWithType extends vscode.QuickPickItem {
        type: 'prompt' | 'clipboard';
        data: any;
    }

    const items: QuickPickItemWithType[] = [];

    // 1. 我的 Prompts（Pinned 優先）
    if (prompts.length > 0) {
        const showWorkspaceLabels = promptProvider.shouldShowWorkspaceLabels();

        items.push({
            label: '我的 Prompts',
            kind: vscode.QuickPickItemKind.Separator,
            type: 'prompt',
            data: null
        } as any);

        const sorted = sortPrompts(prompts);
        sorted.forEach(p => {
            const icon = getPromptQuickPickIcon(p);
            const workspaceName = showWorkspaceLabels ? promptProvider.getWorkspaceNameForPrompt(p.id) : undefined;
            items.push({
                label: `${icon} ${p.title}`,
                description: workspaceName ? `$(folder) ${workspaceName}` : '',
                detail: `使用 ${p.use_count} 次 (${p.content.length} 字元)`,
                type: 'prompt',
                data: p
            });
        });
    }

    // 2. 剪貼簿歷史（最近的放後面）
    if (clipboardHistory.length > 0) {
        items.push({
            label: '剪貼簿歷史',
            kind: vscode.QuickPickItemKind.Separator,
            type: 'prompt',
            data: null
        } as any);

        clipboardHistory.slice(0, 10).forEach(item => {
            const relativeTime = getRelativeTime(item.timestamp);
            items.push({
                label: `$(clock) ${item.preview}`,
                description: '',
                detail: `${relativeTime} (${item.length} 字元)`,
                type: 'clipboard',
                data: item
            });
        });
    }

    const result = await vscode.window.showQuickPick(items, {
        placeHolder: '搜尋 Prompt 或剪貼簿歷史...',
        matchOnDetail: true,
        matchOnDescription: true
    });

    if (result && result.data) {
        if (result.type === 'clipboard') {
            // 剪貼簿項目
            await vscode.env.clipboard.writeText(result.data.content);
            vscode.window.setStatusBarMessage(`✅ 已複製: ${result.data.preview}`, 2000);
        } else if (result.type === 'prompt') {
            // Prompt 項目
            await vscode.env.clipboard.writeText(result.data.content);
            await promptProvider.incrementUseCount(result.data.id);
            vscode.window.showInformationMessage(I18n.getMessage('message.copied', result.data.title));
        }
    }
}

async function handleSelectScope(promptProvider: PromptProvider): Promise<void> {
    const configs = promptProvider.getWorkspaceConfigs();
    if (configs.length <= 1) {
        vscode.window.setStatusBarMessage('Only one Quick Prompt workspace is available', 2500);
        return;
    }

    const pickedKeys = new Set(promptProvider.getPickedWorkspaceScopeKeys());
    const items: (vscode.QuickPickItem & { workspaceKey: string })[] = configs.map(config => ({
        label: config.name,
        description: config.uri.fsPath,
        picked: pickedKeys.has(config.key),
        workspaceKey: config.key
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Select workspaces to show (empty = show all workspaces)',
        matchOnDescription: true
    });

    if (!selected) {
        return;
    }

    await promptProvider.setActiveWorkspaceScope(selected.map(item => item.workspaceKey));
}

/**
 * Handle insert prompt command
 */
async function handleInsertPrompt(item: PromptItem, promptProvider: PromptProvider): Promise<void> {
    await vscode.env.clipboard.writeText(item.prompt.content);
    await promptProvider.incrementUseCount(item.prompt.id);
    vscode.window.showInformationMessage(I18n.getMessage('message.copied', item.prompt.title));
}

/**
 * Helper to pick target workspace in multi-root setup
 */
async function pickWorkspace(promptProvider: PromptProvider): Promise<string | undefined> {
    const configs = promptProvider.getWorkspaceConfigs();
    if (!configs || configs.length <= 1) {
        return configs?.[0]?.key;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (folder) {
            const matched = configs.find((c: any) => c.uri.toString() === folder.uri.toString());
            if (matched) {
                return matched.key;
            }
        }
    }

    const items: (vscode.QuickPickItem & { workspaceKey: string })[] = configs.map((c) => ({
        label: c.name,
        description: c.uri.fsPath,
        workspaceKey: c.key
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '選擇要將 Prompt 儲存至哪一個工作區？'
    });

    return selected?.workspaceKey;
}

/**
 * Handle add prompt command
 * 建立空白 Prompt 並直接開啟內容編輯器，避免先要求輸入標題
 */
async function handleAddPrompt(
    promptProvider: PromptProvider,
    fileSystemProvider: PromptFileSystemProvider
): Promise<void> {
    const targetWorkspace = await pickWorkspace(promptProvider);
    if (!targetWorkspace) {
        return;
    }

    const fallbackTitle = I18n.getMessage('input.untitledPrompt');
    const promptId = await promptProvider.addPromptWithOption(
        fallbackTitle,
        '',
        true,  // silent=true,不顯示儲存通知
        'ai',
        targetWorkspace
    );

    const uri = fileSystemProvider.getUriForPrompt(promptId);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: false
    });

    vscode.window.setStatusBarMessage(I18n.getMessage('message.promptAdded', fallbackTitle), 3000);
}

/**
 * Handle add prompt with custom title command
 * 顯式讓使用者先輸入標題，再輸入內容
 */
async function handleAddPromptWithTitle(
    promptProvider: PromptProvider,
    titleGenService: TitleGenerationService
): Promise<void> {
    const targetWorkspace = await pickWorkspace(promptProvider);
    if (!targetWorkspace) {
        return;
    }

    const title = await vscode.window.showInputBox({
        prompt: I18n.getMessage('input.addPromptWithTitleTitlePrompt'),
        placeHolder: I18n.getMessage('input.addPromptTitlePlaceholder'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return I18n.getMessage('input.titleRequired');
            }
            return null;
        }
    });

    if (!title) {
        return;
    }

    const content = await vscode.window.showInputBox({
        prompt: I18n.getMessage('input.addPromptWithTitleContentPrompt'),
        placeHolder: I18n.getMessage('input.addPromptWithTitleContentPlaceholder'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return I18n.getMessage('input.contentRequired');
            }
            return null;
        }
    });

    if (!content) {
        return;
    }

    await promptProvider.addPromptWithOption(title.trim(), content.trim(), false, 'user', targetWorkspace);
}

/**
 * Handle silent add command (完全靜默版本)
 * 直接使用 AI 生成標題並儲存，不顯示輸入框
 * 儲存後顯示可撤銷通知，讓使用者可以編輯或刪除
 */
async function handleSilentAdd(
    promptProvider: PromptProvider,
    titleGenService: TitleGenerationService
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(I18n.getMessage('message.pleaseSelectText'));
        return;
    }

    const selection = editor.document.getText(editor.selection);
    if (!selection || selection.trim().length === 0) {
        vscode.window.showWarningMessage(I18n.getMessage('message.pleaseSelectText'));
        return;
    }

    const targetWorkspace = await pickWorkspace(promptProvider);
    if (!targetWorkspace) {
        return;
    }

    // 1. 立即生成 Fallback 標題並儲存 (不等待 AI)
    const fallbackTitle = generateAutoTitle(selection);
    const promptId = await promptProvider.addPromptWithOption(
        fallbackTitle,
        selection,
        true,  // silent=true，不顯示儲存通知
        'ai',
        targetWorkspace
    );

    // 2. 顯示狀態列訊息
    vscode.window.setStatusBarMessage(
        `✅ 已儲存: ${fallbackTitle}`,
        3000
    );

    // 3. 背景 AI 生成優化標題 (不阻塞)
    titleGenService.generateProgressively(
        selection,
        async (aiTitle, fallbackTitleFromAI) => {
            // AI 完成後，更新 Prompt 標題
            const prompts = promptProvider.getPrompts();
            const prompt = prompts.find(p => p.id === promptId);

            if (prompt && aiTitle !== fallbackTitle) {
                // 更新標題
                await promptProvider.updatePromptTitle(prompt.id, aiTitle);

                // 顯示可撤銷通知
                showPostSaveNotification(
                    aiTitle,
                    fallbackTitle,
                    prompt.id,
                    promptProvider
                );
            }
        }
    );
}

/**
 * 顯示儲存後的可撤銷通知
 */
async function showPostSaveNotification(
    aiTitle: string,
    fallbackTitle: string,
    promptId: string,
    promptProvider: PromptProvider
): Promise<void> {
    const displayTitle = aiTitle.length > 30
        ? aiTitle.substring(0, 30) + '...'
        : aiTitle;

    // 顯示狀態列訊息 (持續 15 秒)
    const statusBarDisposable = vscode.window.setStatusBarMessage(
        `✨ AI 已優化標題: "${displayTitle}"`,
        15000
    );

    // 顯示通知
    const choice = await vscode.window.showInformationMessage(
        `✨ AI 已優化標題: "${displayTitle}"`,
        { modal: false },
        '保留修改',
        '回復原標題'
    );

    statusBarDisposable.dispose();

    if (choice === '回復原標題') {
        await promptProvider.updatePromptTitle(promptId, fallbackTitle);
        vscode.window.setStatusBarMessage(`✅ 已回復為: ${fallbackTitle}`, 3000);
    }
    // '保留修改' 或關閉通知都不需要額外動作
}

/**
 * Handle edit prompt command
 */
async function handleEditPrompt(
    item: PromptItem | VersionItem | any,
    fileSystemProvider: PromptFileSystemProvider
): Promise<void> {
    // 支援 PromptItem, VersionItem 或任何帶有 promptId 的物件
    const promptId = item?.prompt?.id || item?.promptId;
    if (!promptId) return;

    // 使用虛擬檔案系統開啟 Prompt
    const uri = fileSystemProvider.getUriForPrompt(promptId);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
        preview: false, // 不使用預覽模式，確保分頁不會被自動關閉
        preserveFocus: false
    });
}

async function handleRenamePrompt(item: PromptItem, promptProvider: PromptProvider): Promise<void> {
    const newTitle = await vscode.window.showInputBox({
        prompt: I18n.getMessage('input.addPromptWithTitleTitlePrompt'),
        value: item.prompt.title,
        valueSelection: [0, item.prompt.title.length],
        validateInput: (v) => (!v || v.trim().length === 0)
            ? I18n.getMessage('input.titleRequired')
            : null
    });
    if (!newTitle) { return; }
    await promptProvider.updatePromptTitle(item.prompt.id, newTitle.trim());
}

/**
 * Handle copy clipboard item command
 */
async function handleCopyClipboardItem(item: ClipboardTreeItem): Promise<void> {
    if (!item || !item.item) return;

    await vscode.env.clipboard.writeText(item.item.content);
    vscode.window.showInformationMessage(`✅ 已複製: ${item.item.preview}`);
}

/**
 * Handle pin clipboard item command (Silent 模式)
 */
async function handlePinClipboardItem(
    item: ClipboardTreeItem,
    promptProvider: PromptProvider,
    clipboardManager: ClipboardManager,
    titleGenService: TitleGenerationService
): Promise<void> {
    if (!item || !item.item) return;

    const targetWorkspace = await pickWorkspace(promptProvider);
    if (!targetWorkspace) {
        return;
    }

    // 1. 立即生成 Fallback 標題並儲存 (不等待 AI)
    const fallbackTitle = generateAutoTitle(item.item.content);
    const promptId = await promptProvider.addPromptWithOption(
        fallbackTitle,
        item.item.content,
        true,  // silent=true,不顯示儲存通知
        'ai',
        targetWorkspace
    );

    // 2. 移除剪貼簿項目
    clipboardManager.removeFromHistory(item.item.id);

    // 3. 顯示狀態列訊息
    vscode.window.setStatusBarMessage(
        `✅ 已固定: ${fallbackTitle}`,
        3000
    );

    // 4. 背景 AI 生成優化標題 (不阻塞)
    titleGenService.generateProgressively(
        item.item.content,
        async (aiTitle, fallbackTitleFromAI) => {
            // AI 完成後,更新 Prompt 標題
            const prompts = promptProvider.getPrompts();
            const prompt = prompts.find(p => p.id === promptId);

            if (prompt && aiTitle !== fallbackTitle) {
                // 更新標題
                await promptProvider.updatePromptTitle(prompt.id, aiTitle);

                // 顯示可撤銷通知
                showPostSaveNotification(
                    aiTitle,
                    fallbackTitle,
                    prompt.id,
                    promptProvider
                );
            }
        }
    );
}

async function handleViewClipboardItem(item: ClipboardTreeItem, previewProvider: ClipboardPreviewProvider): Promise<void> {
    if (!item || !item.item) { return; }
    previewProvider.update(item.item.content);
    const doc = await vscode.workspace.openTextDocument(ClipboardPreviewProvider.uri);
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
}

/**
 * Handle remove clipboard item command
 */
async function handleRemoveClipboardItem(
    item: ClipboardTreeItem,
    clipboardManager: ClipboardManager
): Promise<void> {
    if (!item || !item.item) return;

    clipboardManager.removeFromHistory(item.item.id);
    vscode.window.setStatusBarMessage(I18n.getMessage('message.clipboardItemRemoved'), 3000);
}

/**
 * Handle clear clipboard history command
 */
async function handleClearClipboardHistory(clipboardManager: ClipboardManager): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        I18n.getMessage('confirm.clearClipboardHistory'),
        { modal: true },
        I18n.getMessage('confirm.yes')
    );

    if (confirm === I18n.getMessage('confirm.yes')) {
        clipboardManager.clearHistory();
        vscode.window.showInformationMessage(I18n.getMessage('message.clipboardHistoryCleared'));
    }
}

/**
 * Handle clear AI model cache command
 */
async function handleClearModelCache(aiEngine: AIEngine): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        I18n.getMessage('confirm.clearModelCache'),
        { modal: true },
        I18n.getMessage('confirm.yes')
    );

    if (confirm === I18n.getMessage('confirm.yes')) {
        try {
            await aiEngine.clearModelCache();
            vscode.window.showInformationMessage(I18n.getMessage('message.modelCacheCleared'));
        } catch (error) {
            console.error('[Commands] Failed to clear model cache:', error);
            vscode.window.showErrorMessage(`Failed to clear cache: ${error}`);
        }
    }
}

/**
 * Handle test AI connection command
 *
 * - provider=none / disabled → 提示使用者先開啟 AI 功能
 * - provider=local-qwen      → 提示本機模型不需測試連線
 * - provider=openai-compatible → 實際呼叫 API 測試並回傳結果
 */
async function handleTestAIConnection(aiEngine: AIEngine): Promise<void> {
    const config = vscode.workspace.getConfiguration('quickPrompt.ai');
    const enabled = config.get<boolean>('enabled', false);

    if (!enabled) {
        vscode.window.showWarningMessage(
            'Quick Prompt: AI 功能尚未啟用。請先至設定中開啟 quickPrompt.ai.enabled。'
        );
        return;
    }

    const provider = config.get<string>('provider', 'local-qwen');

    if (provider === 'local-qwen') {
        const status = aiEngine.getStatus();
        const statusText = status === 'ready' ? '✅ 已就緒' : status === 'initializing' ? '⏳ 載入中...' : `❌ ${status}`;
        vscode.window.showInformationMessage(
            `Quick Prompt: 本機 Qwen 模型狀態 — ${statusText}（本機模型不需測試連線）`
        );
        return;
    }

    if (provider === 'openai-compatible') {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Quick Prompt: 測試 AI 連線中...',
            cancellable: false
        }, async () => {
            const client = new OpenAICompatibleClient();
            const result = await client.testConnection();
            const { endpoint, model } = client.getConfig();

            if (result.ok) {
                vscode.window.showInformationMessage(
                    `✅ AI 連線成功！\n端點：${endpoint}\n模型：${model}`
                );
            } else {
                vscode.window.showErrorMessage(
                    `❌ AI 連線失敗：${result.error}\n\n請確認 Ollama 或伺服器已啟動，端點設定為：${endpoint}`
                );
            }
        });
    }
}
