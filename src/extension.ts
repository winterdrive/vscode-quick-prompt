import * as vscode from 'vscode';
import { PromptProvider } from './promptProvider';
import { ClipboardProvider } from './clipboardProvider';
import { PromptFileSystemProvider } from './promptFileSystem';
import { ClipboardManager } from './clipboardManager';
import { PromptHoverProvider } from './promptHoverProvider';
import { I18n } from './i18n';
import { registerPromptCommands, registerClipboardCommands, registerVersionCommands } from './commands';
import { registerPrivacyCommands } from './commands/privacyCommands';
import { MaskingEngine } from './privacy/maskingEngine';
import { AIEngine } from './ai/aiEngine';
import { TitleGenerationService } from './services/titleGenerationService';
import { VersionHistoryService } from './services/VersionHistoryService';
import { McpConfigPanel } from './mcp/McpConfigPanel';
import { SkillGenerator } from './mcp/SkillGenerator';

export async function activate(context: vscode.ExtensionContext) {
    // Initialize i18n
    await I18n.initialize(context);

    // Initialize AI engine (lazy loading - won't block startup)
    const aiEngine = AIEngine.getInstance();
    // Don't await - let it initialize in background
    aiEngine.initialize(context).catch(err => {
        console.error('[Extension] AI Engine initialization failed:', err);
    });

    // Initialize Privacy Protection (v0.3.0)
    const maskingEngine = MaskingEngine.getInstance(context);
    console.log('[Extension] Privacy protection initialized');

    // Initialize version history service
    const versionHistoryService = new VersionHistoryService(context);

    // Initialize providers
    const { promptProvider, clipboardManager, clipboardProvider } = initializeProviders(context, versionHistoryService);

    // Initialize version history for existing prompts (migration)
    await initializeVersionHistory(promptProvider, versionHistoryService);

    // Initialize file system
    const fileSystemProvider = initializeFileSystem(context, promptProvider);

    // Initialize hover provider
    initializeHoverProvider(context, promptProvider, clipboardManager);

    // Initialize status bar
    initializeStatusBar(context, clipboardManager);

    // Initialize title generation services
    const titleGenService = new TitleGenerationService(aiEngine);


    // Register all commands (pass aiEngine and title services)
    registerPromptCommands(context, promptProvider, clipboardManager, fileSystemProvider, aiEngine);
    registerClipboardCommands(context, promptProvider, clipboardManager, fileSystemProvider, aiEngine, titleGenService);
    registerVersionCommands(context, promptProvider, versionHistoryService);
    registerPrivacyCommands(context, maskingEngine);

    // Register MCP commands
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.showMcpConfig', () => {
            McpConfigPanel.show(context.extensionUri);
        }),
        vscode.commands.registerCommand('quickPrompt.generateSkill', () => {
            SkillGenerator.generateSkill(context);
        }),
    );

    // Setup cleanup
    setupCleanup(context, clipboardManager, aiEngine);

    // 強制刷新 PromptProvider，確保非同步載入的 prompts 正確顯示
    // 這是因為 PromptProvider 構造函數中的 loadPrompts() 是非同步的，
    // 在 registerTreeDataProvider 時可能還未完成載入
    await promptProvider.refresh();
}

export function deactivate() { }

// ==================== Initialization Functions ====================

/**
 * Initialize core providers (PromptProvider, ClipboardProvider and ClipboardManager)
 */
function initializeProviders(context: vscode.ExtensionContext, versionHistoryService: VersionHistoryService) {
    // 初始化 PromptProvider
    const promptProvider = new PromptProvider(context, versionHistoryService);
    vscode.window.registerTreeDataProvider('promptSniperView', promptProvider);

    // 初始化 ClipboardManager
    const clipboardManager = new ClipboardManager(context);
    promptProvider.setClipboardManager(clipboardManager);

    // 初始化 ClipboardProvider (新的獨立剪貼簿視圖)
    const clipboardProvider = new ClipboardProvider();
    clipboardProvider.setClipboardManager(clipboardManager);
    vscode.window.registerTreeDataProvider('clipboardHistoryView', clipboardProvider);

    // 註冊即時捕捉（監聽選取變化）
    clipboardManager.registerInstantCapture(context.subscriptions);

    return { promptProvider, clipboardManager, clipboardProvider };
}

/**
 * Initialize virtual file system provider
 */
function initializeFileSystem(
    context: vscode.ExtensionContext,
    promptProvider: PromptProvider
): PromptFileSystemProvider {
    const fileSystemProvider = new PromptFileSystemProvider();

    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('prompt-sniper', fileSystemProvider, {
            isCaseSensitive: true,
            isReadonly: false
        })
    );

    // 設定雙向綁定：FileSystem ↔ PromptProvider
    fileSystemProvider.setCallbacks(
        (id, content) => promptProvider.updatePromptContent(id, content),
        () => promptProvider.getPrompts()
    );

    // 當 PromptProvider 更新時，同步到 FileSystem
    promptProvider.onPromptsChanged(() => {
        fileSystemProvider.rebuildCache();
    });

    return fileSystemProvider;
}

/**
 * Initialize hover provider for virtual files
 */
function initializeHoverProvider(
    context: vscode.ExtensionContext,
    promptProvider: PromptProvider,
    clipboardManager: ClipboardManager
): void {
    const hoverProvider = new PromptHoverProvider();

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { scheme: 'prompt-sniper', language: 'markdown' },
            hoverProvider
        )
    );

    // 初始化 HoverProvider 資料
    hoverProvider.updatePrompts(promptProvider.getPrompts());
    hoverProvider.updateClipboardHistory(clipboardManager.getHistory());

    // 當 Prompts 或剪貼簿歷史更新時，同步到 HoverProvider
    promptProvider.onPromptsChanged(() => {
        hoverProvider.updatePrompts(promptProvider.getPrompts());
    });

    clipboardManager.onHistoryChanged(() => {
        hoverProvider.updateClipboardHistory(clipboardManager.getHistory());
    });
}

/**
 * Initialize status bar item for clipboard
 */
function initializeStatusBar(
    context: vscode.ExtensionContext,
    clipboardManager: ClipboardManager
): void {
    const clipboardStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    clipboardStatusBar.command = 'promptSniper.search'; // 點擊狀態列開啟搜尋
    clipboardStatusBar.text = '$(clippy)'; // 使用剪貼簿圖示
    context.subscriptions.push(clipboardStatusBar);

    // 更新狀態列顯示
    const updateStatusBar = () => {
        const history = clipboardManager.getHistory();
        if (history.length > 0) {
            const latest = history[0];
            // 僅顯示圖示，tooltip 顯示完整預覽
            clipboardStatusBar.text = '$(clippy)';
            clipboardStatusBar.tooltip = `📋 最新剪貼簿: ${latest.preview}\n點擊開啟 Quick Prompt 搜尋`;
            clipboardStatusBar.show();
        } else {
            clipboardStatusBar.hide();
        }
    };

    // 初始更新
    updateStatusBar();

    // 監聽剪貼簿歷史變化
    clipboardManager.onHistoryChanged(() => {
        updateStatusBar();
    });
}

/**
 * Setup cleanup handlers
 */
function setupCleanup(
    context: vscode.ExtensionContext,
    clipboardManager: ClipboardManager,
    aiEngine: AIEngine
): void {
    context.subscriptions.push({
        dispose: () => {
            clipboardManager.dispose();
            aiEngine.dispose();
        }
    });
}
/**
 * Initialize version history for existing prompts (one-time migration)
 */
async function initializeVersionHistory(
    promptProvider: PromptProvider,
    versionHistoryService: VersionHistoryService
): Promise<void> {
    try {
        const prompts = promptProvider.getPrompts();

        for (const prompt of prompts) {
            const history = await versionHistoryService.loadHistory(prompt.id);

            // If no version history exists, create initial version
            if (history.versions.length === 0) {
                await versionHistoryService.createVersion(prompt.id, {
                    content: prompt.content,
                    changeType: 'create'
                });
            }
        }
    } catch (error) {
        console.error('Failed to initialize version history:', error);
        // Don't block extension activation on version history initialization failure
    }
}

