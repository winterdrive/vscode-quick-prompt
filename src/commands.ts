import * as vscode from 'vscode';
import * as path from 'path';
import { PromptProvider, PromptItem } from './promptProvider';
import { ClipboardTreeItem } from './clipboardProvider';
import { ClipboardManager } from './clipboardManager';
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
import { SessionHandoffService } from './core/SessionHandoffService';
import { SessionItem } from './ui/SessionHandoffProvider';

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
        vscode.commands.registerCommand('promptSniper.search', async () => {
            await handleSearch(promptProvider, clipboardManager);
        })
    );

    // 複製 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.insert', async (item: PromptItem) => {
            await handleInsertPrompt(item, promptProvider);
        })
    );

    // 新增 Prompt - 智慧模式（支援 "標題::內容" 語法）
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.addPrompt', async () => {
            await handleAddPrompt(promptProvider, titleGenService);
        })
    );

    // 新增 Prompt - 自訂標題模式
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.addPromptWithTitle', async () => {
            await handleAddPromptWithTitle(promptProvider, titleGenService);
        })
    );

    // 新增 Prompt - Silent Capture (無干擾捕捉)
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.silentAdd', async () => {
            await handleSilentAdd(promptProvider, titleGenService);
        })
    );

    // 刪除 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.deletePrompt', async (item: PromptItem) => {
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
        vscode.commands.registerCommand('promptSniper.maskPrompt', async (item: PromptItem) => {
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
        vscode.commands.registerCommand('promptSniper.unmaskPrompt', async (item: PromptItem) => {
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
        vscode.commands.registerCommand('promptSniper.ignorePromptWarning', async (item: PromptItem) => {
            if (item?.prompt?.id) {
                await promptProvider.ignorePromptWarning(item.prompt.id);
            }
        })
    );

    // 重新啟用 Prompt 隱私警告
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.restorePromptWarning', async (item: PromptItem) => {
            if (item?.prompt?.id) {
                await promptProvider.restorePromptWarning(item.prompt.id);
            }
        })
    );

    // 釘選/取消釘選 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.togglePin', async (item: PromptItem) => {
            await promptProvider.togglePin(item);
        })
    );

    // 重新整理
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.refresh', async () => {
            await promptProvider.refresh();
            vscode.window.showInformationMessage(I18n.getMessage('message.refreshed'));
        })
    );

    // 編輯 Prompt (使用虛擬檔案系統)
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.editPrompt', async (item: PromptItem) => {
            await handleEditPrompt(item, fileSystemProvider);
        })
    );

    // 上移 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.moveUp', async (item: PromptItem) => {
            await promptProvider.moveUp(item);
        })
    );

    // 下移 Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.moveDown', async (item: PromptItem) => {
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
    maskingEngine?: MaskingEngine
): void {
    // 複製剪貼簿歷史項目
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.copyClipboardItem', async (item: ClipboardTreeItem) => {
            await handleCopyClipboardItem(item);
        })
    );

    // 固定剪貼簿項目到 Prompts（無需輸入標題，靜默模式）
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.pinClipboardItem', async (item: ClipboardTreeItem) => {
            await handlePinClipboardItem(item, promptProvider, clipboardManager, titleGenService);
        })
    );

    // 編輯剪貼簿項目（自動轉為永久 Prompt）
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.editClipboardItem', async (item: ClipboardTreeItem) => {
            await handleEditClipboardItem(item, promptProvider, clipboardManager, fileSystemProvider);
        })
    );

    // 從歷史移除剪貼簿項目
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.removeClipboardItem', async (item: ClipboardTreeItem) => {
            await handleRemoveClipboardItem(item, clipboardManager);
        })
    );

    // 清空剪貼簿歷史
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.clearClipboardHistory', async () => {
            await handleClearClipboardHistory(clipboardManager);
        })
    );

    // 清除 AI 模型快取
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.clearModelCache', async () => {
            await handleClearModelCache(aiEngine);
        })
    );

    // 測試 AI 連線（僅 openai-compatible 有意義）
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.testAIConnection', async () => {
            await handleTestAIConnection(aiEngine);
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
        vscode.commands.registerCommand('promptSniper.showVersionDiff', async (item: VersionItem) => {
            await versionCommands.handleShowVersionDiff(item, versionHistoryService);
        })
    );

    // Apply Version Command (Soft Checkout)
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.applyVersion', (item: VersionItem) => {
            versionCommands.handleApplyVersion(item, promptProvider);
        })
    );

    // Tag milestone
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.tagMilestone', async (item: VersionItem) => {
            await versionCommands.handleTagMilestone(item, versionHistoryService, promptProvider);
        })
    );

    // Rename milestone
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.renameMilestone', async (item: VersionItem) => {
            await versionCommands.handleRenameMilestone(item, versionHistoryService, promptProvider);
        })
    );

    // Remove milestone
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.removeMilestone', async (item: VersionItem) => {
            await versionCommands.handleRemoveMilestone(item, versionHistoryService, promptProvider);
        })
    );

    // Delete version
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.deleteVersion', async (item: VersionItem) => {
            await versionCommands.handleDeleteVersion(item, versionHistoryService, promptProvider);
        })
    );

    // Copy version content
    context.subscriptions.push(
        vscode.commands.registerCommand('promptSniper.copyVersionContent', async (item: VersionItem) => {
            await versionCommands.handleCopyVersionContent(item, promptProvider);
        })
    );
}

/**
 * Register Edo Tensei session handoff commands
 */
export function registerSessionHandoffCommands(
    context: vscode.ExtensionContext,
    sessionService: SessionHandoffService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('edoTensei.sealSession', async () => {
            await handleSealSession(sessionService);
        }),
        vscode.commands.registerCommand('edoTensei.resurrectSession', async (item?: SessionItem) => {
            await handleResurrectSession(sessionService, item);
        }),
        vscode.commands.registerCommand('edoTensei.copyHandoffPrompt', async (item?: SessionItem) => {
            await handleCopyHandoffPrompt(sessionService, item);
        }),
        vscode.commands.registerCommand('edoTensei.openSessionFile', async () => {
            await handleOpenSessionFile(sessionService);
        }),
        vscode.commands.registerCommand('edoTensei.scanSessions', async () => {
            await handleScanProjectSessions(sessionService);
        }),
        vscode.commands.registerCommand('edoTensei.fetchAllSessions', async () => {
            await handleFetchAllSessions(sessionService);
        }),
        vscode.commands.registerCommand('edoTensei.exportAllSessions', async () => {
            await handleExportAllSessions(sessionService);
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
    const prompts = promptProvider.getPrompts();
    const clipboardHistory = clipboardManager.getHistory();

    interface QuickPickItemWithType extends vscode.QuickPickItem {
        type: 'prompt' | 'clipboard';
        data: any;
    }

    const items: QuickPickItemWithType[] = [];

    // 1. 我的 Prompts（Pinned 優先）
    if (prompts.length > 0) {
        items.push({
            label: '我的 Prompts',
            kind: vscode.QuickPickItemKind.Separator,
            type: 'prompt',
            data: null
        } as any);

        const sorted = sortPrompts(prompts);
        sorted.forEach(p => {
            const icon = getPromptQuickPickIcon(p);
            items.push({
                label: `${icon} ${p.title}`,
                description: '',
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

/**
 * Handle insert prompt command
 */
async function handleInsertPrompt(item: PromptItem, promptProvider: PromptProvider): Promise<void> {
    await vscode.env.clipboard.writeText(item.prompt.content);
    await promptProvider.incrementUseCount(item.prompt.id);
    vscode.window.showInformationMessage(I18n.getMessage('message.copied', item.prompt.title));
}

/**
 * Handle add prompt command (漸進式版本)
 * 支援 "標題::內容" 語法，但優先使用漸進式 AI 生成
 */
async function handleAddPrompt(
    promptProvider: PromptProvider,
    titleGenService: TitleGenerationService
): Promise<void> {
    // 1. 輸入內容
    const input = await vscode.window.showInputBox({
        prompt: I18n.getMessage('input.addPromptPrompt'),
        placeHolder: I18n.getMessage('input.addPromptPlaceholder'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return I18n.getMessage('input.contentRequired');
            }
            return null;
        }
    });

    if (!input) {
        return;
    }

    // 2. 智慧解析：支援 "標題::內容" 格式
    let title: string = '';
    let content: string;
    let userProvidedTitle = false;

    if (input.includes('::')) {
        const parts = input.split('::', 2);
        const parsedTitle = parts[0].trim();
        content = parts[1].trim();

        if (parsedTitle) {
            // 使用者提供了標題，直接使用
            title = parsedTitle;
            userProvidedTitle = true;
        } else {
            // 標題為空，使用漸進式生成
            userProvidedTitle = false;
        }
    } else {
        content = input;
        userProvidedTitle = false;
    }

    // 3. 如果使用者已提供標題，直接儲存
    if (userProvidedTitle) {
        await promptProvider.addPrompt(title, content, 'user');
        return;
    }

    // 4. Silent 模式: 立即生成 Fallback 標題並儲存 (不等待 AI)
    const fallbackTitle = generateAutoTitle(content);
    const promptId = await promptProvider.addPromptWithOption(
        fallbackTitle,
        content,
        true,  // silent=true,不顯示儲存通知
        'ai'
    );

    // 5. 顯示狀態列訊息
    vscode.window.setStatusBarMessage(
        `✅ 已儲存: ${fallbackTitle}`,
        3000
    );

    // 6. 背景 AI 生成優化標題 (不阻塞)
    titleGenService.generateProgressively(
        content,
        async (aiTitle, fallbackTitleFromAI) => {
            // AI 完成後,更新 Prompt 標題
            const prompts = promptProvider.getPrompts();
            const prompt = prompts.find(p => p.content === content);

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
 * Handle add prompt with custom title command (漸進式版本)
 * 現在與 handleAddPrompt 行為一致，保留此命令以維持向後相容
 */
async function handleAddPromptWithTitle(
    promptProvider: PromptProvider,
    titleGenService: TitleGenerationService
): Promise<void> {
    // 直接呼叫 handleAddPrompt，行為完全一致
    await handleAddPrompt(promptProvider, titleGenService);
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

    // 1. 立即生成 Fallback 標題並儲存 (不等待 AI)
    const fallbackTitle = generateAutoTitle(selection);
    const promptId = await promptProvider.addPromptWithOption(
        fallbackTitle,
        selection,
        true,  // silent=true，不顯示儲存通知
        'ai'
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
            const prompt = prompts.find(p => p.content === selection);

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

    // 1. 立即生成 Fallback 標題並儲存 (不等待 AI)
    const fallbackTitle = generateAutoTitle(item.item.content);
    const promptId = await promptProvider.addPromptWithOption(
        fallbackTitle,
        item.item.content,
        true,  // silent=true,不顯示儲存通知
        'ai'
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
            const prompt = prompts.find(p => p.content === item.item.content);

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
 * Handle edit clipboard item command
 */
async function handleEditClipboardItem(
    item: ClipboardTreeItem,
    promptProvider: PromptProvider,
    clipboardManager: ClipboardManager,
    fileSystemProvider: PromptFileSystemProvider
): Promise<void> {
    if (!item || !item.item) return;

    // 自動轉為 Prompt（使用預覽作為標題，靜默模式）
    const title = generateAutoTitle(item.item.preview);
    await promptProvider.addPromptWithOption(title, item.item.content, true);
    clipboardManager.removeFromHistory(item.item.id);

    // 找到剛新增的 Prompt 並開啟編輯
    const prompts = promptProvider.getPrompts();
    const newPrompt = prompts[prompts.length - 1]; // 最新的一個

    if (newPrompt) {
        const uri = fileSystemProvider.getUriForPrompt(newPrompt.id);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false
        });
    }
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

async function handleSealSession(sessionService: SessionHandoffService): Promise<void> {
    if (!sessionService.getWorkspaceRoot()) {
        vscode.window.showWarningMessage('Edo Tensei: 請先開啟專案資料夾再封印 session。');
        return;
    }

    // Minimal context capture for manual UI trigger
    const activeEditor = vscode.window.activeTextEditor;
    let historyStr = '[System]: Session sealed manually via UI. Full chat history not available.\n';
    if (activeEditor) {
        historyStr += `Currently active file: ${activeEditor.document.uri.fsPath}\n`;
    }

    const savedUri = await sessionService.saveSession(historyStr);
    if (!savedUri) {
        vscode.window.showErrorMessage('Edo Tensei: 封印失敗，找不到工作區。');
        return;
    }

    vscode.window.showInformationMessage(`Edo Tensei: 已一鍵封印 session 至 ${savedUri.fsPath}`);
}

async function handleResurrectSession(sessionService: SessionHandoffService, item?: SessionItem): Promise<void> {
    let handoffPrompt = '';
    
    if (item) {
        handoffPrompt = sessionService.buildPromptFromCapturedSession(item.session);
    } else {
        const session = await sessionService.readSession();
        if (!session) {
            vscode.window.showWarningMessage('Edo Tensei: 找不到可復活的 session。');
            return;
        }
        handoffPrompt = session.handoffPrompt;
    }

    const workspaceRoot = sessionService.getWorkspaceRoot()?.fsPath;
    let uri: vscode.Uri;

    if (workspaceRoot) {
        let projectName = 'unknown';
        let capturedAt = new Date().toISOString();
        let sourceIde = 'general';

        if (item) {
            sourceIde = item.session.sourceIde;
            capturedAt = item.session.capturedAt;
            if (item.session.workspacePath) {
                projectName = path.basename(item.session.workspacePath);
            } else if (item.session.rawPath) {
                const parts = item.session.rawPath.split(/[\\\/]/);
                if (parts.length > 2) {
                    projectName = parts[parts.length - 2];
                }
            }
        }

        const datePart = capturedAt.replace(/[:.]/g, '-').slice(0, 19);
        const targetDir = path.join(workspaceRoot, '.edo_tensei', sourceIde, projectName);
        const filePath = path.join(targetDir, `resurrect_${datePart}.md`);
        
        // 確保目錄存在
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(targetDir));
        } catch { /* ignore */ }

        uri = vscode.Uri.file(filePath).with({ scheme: 'untitled' });
    } else {
        uri = vscode.Uri.parse('untitled:resurrected_session.md');
    }

    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        
        // 填入內容（覆蓋，避免連點重複 append）
        const lastLine = doc.lineAt(doc.lineCount - 1);
        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(doc.lineCount - 1, lastLine.text.length)
        );
        await editor.edit((editBuilder) => {
            editBuilder.replace(fullRange, handoffPrompt);
        });
        
        vscode.window.setStatusBarMessage('✨ Edo Tensei: Session 復活成功，已開啟草稿。', 3000);
    } catch (error) {
        vscode.window.showErrorMessage(`Edo Tensei: 無法復活 session (${error})`);
    }
}

async function handleCopyHandoffPrompt(sessionService: SessionHandoffService, item?: SessionItem): Promise<void> {
    if (item) {
        const prompt = sessionService.buildPromptFromCapturedSession(item.session);
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage('Edo Tensei: 已複製 handoff prompt。');
        return;
    }

    const session = await sessionService.readSession();
    if (!session) {
        vscode.window.showWarningMessage('Edo Tensei: 找不到 session，請先封印。');
        return;
    }
    await vscode.env.clipboard.writeText(session.handoffPrompt);
    vscode.window.showInformationMessage('Edo Tensei: 已複製 handoff prompt。');
}

async function handleOpenSessionFile(sessionService: SessionHandoffService): Promise<void> {
    const uri = sessionService.getSessionFileUri();
    if (!uri) {
        vscode.window.showErrorMessage('Edo Tensei: 無法取得 session 檔案路徑。');
        return;
    }
    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    } catch (error) {
        vscode.window.showErrorMessage(`Edo Tensei: 開啟檔案失敗 (${error})`);
    }
}

async function handleScanProjectSessions(sessionService: SessionHandoffService): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Scanning Project IDE Sessions...",
        cancellable: false
    }, async () => {
        try {
            const sessions = await sessionService.scanProjectSessions();
            if (sessions.length > 0) {
                vscode.window.setStatusBarMessage(`✅ Edo Tensei: Found ${sessions.length} project sessions`, 3000);
            } else {
                vscode.window.showInformationMessage('Edo Tensei: No project matching sessions found.');
            }
        } catch (e) {
            vscode.window.showErrorMessage('Edo Tensei: Error scanning sessions.');
        }
    });
}

async function handleFetchAllSessions(sessionService: SessionHandoffService): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Fetching ALL Historical IDE Sessions...",
        cancellable: false
    }, async () => {
        try {
            const sessions = await sessionService.scanAllSessions();
            vscode.window.showInformationMessage(`Edo Tensei: Fetched ${sessions.length} historical sessions.`);
        } catch (e) {
            vscode.window.showErrorMessage('Edo Tensei: Error fetching all sessions.');
        }
    });
}

async function handleExportAllSessions(sessionService: SessionHandoffService): Promise<void> {
    const sessions = sessionService.getSessions();
    if (sessions.length === 0) {
        vscode.window.showWarningMessage('Edo Tensei: 面板中沒有可匯出的對話紀錄。請先掃描或 Fetch All。');
        return;
    }

    const workspaceRoot = sessionService.getWorkspaceRoot()?.fsPath;
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('Edo Tensei: 請先開啟專案資料夾再執行批次匯出。');
        return;
    }

    const edoTenseiDir = path.join(workspaceRoot, '.edo_tensei');
    const edoTenseiUri = vscode.Uri.file(edoTenseiDir);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Edo Tensei: 正在批次匯出 ${sessions.length} 個 Session...`,
        cancellable: false
    }, async (progress) => {
        try {
            // 確保目錄存在
            await vscode.workspace.fs.createDirectory(edoTenseiUri);

            let successCount = 0;
            for (let i = 0; i < sessions.length; i++) {
                const session = sessions[i];
                // 使用 ISO 格式簡化，並移除非法字元
                const datePart = session.capturedAt.replace(/[:.]/g, '-').slice(0, 19);
                
                // 取得專案名稱
                let projectName = 'unknown';
                if (session.workspacePath) {
                    projectName = path.basename(session.workspacePath);
                } else if (session.rawPath) {
                    // 如果沒有專案路徑，試著從原始路徑推測（例如取父目錄名稱）
                    const parts = session.rawPath.split(/[\\\/]/);
                    if (parts.length > 2) {
                        projectName = parts[parts.length - 2];
                    }
                }

                // 建立層級路徑: .edo_tensei/[IDE]/[Project]/
                const ideFolderUri = vscode.Uri.joinPath(edoTenseiUri, session.sourceIde);
                const projectFolderUri = vscode.Uri.joinPath(ideFolderUri, projectName);
                
                await vscode.workspace.fs.createDirectory(projectFolderUri);

                // 檔名加入 sessionId 前 8 碼確保唯一性
                const shortId = (session.sessionId || 'nosid').substring(0, 8);
                const fileName = `${datePart}_${shortId}.md`;
                const fileUri = vscode.Uri.joinPath(projectFolderUri, fileName);
                
                const content = sessionService.buildPromptFromCapturedSession(session);
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
                
                successCount++;
                progress.report({ increment: (1 / sessions.length) * 100 });
            }

            vscode.window.showInformationMessage(`✅ Edo Tensei: 成功匯出 ${successCount} 個 Session 至 .edo_tensei 資料夾！`);
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Edo Tensei: 匯出過程發生錯誤 (${error})`);
        }
    });
}
