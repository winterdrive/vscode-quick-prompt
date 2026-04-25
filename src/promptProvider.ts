import * as vscode from 'vscode';
import { I18n } from './i18n';
import { ClipboardManager } from './clipboardManager';
import { VersionHistoryService } from './services/VersionHistoryService';
import { VersionItem } from './treeItems/VersionItem';
import { PatternEngine } from './privacy/masking/patternEngine';
import { SecretStorageManager } from './privacy/masking/secretStorage';
import {
    getPromptIcon,
    sortPrompts,
    generatePromptId,
    formatRelativeTime,
    getTodayISOString} from './utils';

// Prompt 與 PrivacyMeta 的唯一來源，從 core/types 統一 re-export
export type { Prompt, PrivacyMeta } from './core/types';
import type { Prompt } from './core/types';

// TreeItem 類型 (支援 PromptItem 和 VersionItem)
export type PromptTreeItem = PromptItem | VersionItem;

export class PromptProvider implements vscode.TreeDataProvider<PromptTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PromptTreeItem | undefined | null | void> = new vscode.EventEmitter<PromptTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PromptTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // 新增：Prompts 資料變更事件（用於同步到 FileSystem）
    private _onPromptsChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onPromptsChanged: vscode.Event<void> = this._onPromptsChanged.event;

    private prompts: Prompt[] = [];
    private promptsFilePath: string;
    private clipboardManager?: ClipboardManager;
    private versionHistoryService: VersionHistoryService;
    private secretStorage: SecretStorageManager;

    constructor(private context: vscode.ExtensionContext, versionHistoryService?: VersionHistoryService) {
        this.secretStorage = new SecretStorageManager(context.secrets);
        // 初始化版本歷史服務 (使用傳入的實例，若無則建立新實例 - 但建議由外部傳入以保持單例)
        this.versionHistoryService = versionHistoryService || new VersionHistoryService(context);
        // 注入 PromptProvider 以便 VersionHistoryService 更新 Metadata
        this.versionHistoryService.setPromptProvider(this);

        // 使用工作區路徑而非擴充功能路徑
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode');
            this.promptsFilePath = vscode.Uri.joinPath(vscodeDir, 'prompts.json').fsPath;
        } else {
            // 如果沒有工作區，使用擴充功能路徑作為備用
            this.promptsFilePath = vscode.Uri.joinPath(context.extensionUri, 'prompts.json').fsPath;
        }
        // 初始化時載入 prompts（但不阻塞）
        this.loadPrompts().catch(err => {
            console.error('Failed to load prompts:', err);
        });
    }

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

    async refresh(): Promise<void> {
        await this.loadPrompts();
        this._onDidChangeTreeData.fire();
    }

    private async loadPrompts(): Promise<void> {
        try {
            const uri = vscode.Uri.file(this.promptsFilePath);
            const content = await vscode.workspace.fs.readFile(uri);
            let prompts = JSON.parse(content.toString());

            // 自動遷移：移除舊欄位 (status)，補齊新欄位
            let needsMigration = false;
            let needsMetaUpdate = false;

            // 平行處理所有 Prompts 的 Metadata 檢查
            const processedPrompts = await Promise.all(prompts.map(async (p: any) => {
                // 檢查是否有舊欄位
                if ('status' in p) {
                    needsMigration = true;
                }

                // 檢查是否缺少 meta
                if (!p.meta) {
                    needsMetaUpdate = true;
                    // 讀取歷史檔案以取得正確的版本資訊
                    try {
                        const history = await this.versionHistoryService.loadHistory(p.id);
                        p.meta = {
                            totalVersions: history.versions.length,
                            latestVersionId: history.currentVersionId
                        };
                    } catch (e) {
                        p.meta = { totalVersions: 0 };
                    }
                }

                const today = getTodayISOString();
                return {
                    id: p.id,
                    title: p.title,
                    content: p.content,
                    use_count: p.use_count ?? 0,
                    last_used: p.last_used || today,
                    created_at: p.created_at || p.last_used || today,
                    pinned: p.pinned ?? false,
                    titleSource: p.titleSource,
                    order: p.order,
                    meta: p.meta,
                    ignorePrivacyWarning: p.ignorePrivacyWarning ?? false,
                    privacyMeta: p.privacyMeta
                };
            }));

            this.prompts = processedPrompts;

            // 如果有遷移,自動儲存清理後的資料(靜默模式)
            if (needsMigration || needsMetaUpdate) {
                console.log('[PromptProvider] Doing migration or meta update...');
                await this.savePrompts();
            }
        } catch (error: any) {
            if (error.code === 'FileNotFound') {
                // 檔案不存在時，建立預設檔案
                await this.createDefaultPromptsFile();
            } else {
                console.error('Failed to load prompts:', error);
                throw error;
            }
        }
    }

    private async createDefaultPromptsFile(): Promise<void> {
        const today = getTodayISOString();
        const defaultPrompts: Prompt[] = [
            {
                id: "001",
                title: "範例 Prompt",
                content: "這是一個範例 Prompt。您可以編輯 .vscode/prompts.json 來新增更多 Prompt。",
                use_count: 0,
                last_used: today,
                created_at: today,
                pinned: false,
                meta: { totalVersions: 0 }
            }
        ];

        try {
            const uri = vscode.Uri.file(this.promptsFilePath);
            const dirUri = vscode.Uri.file(vscode.Uri.joinPath(uri, '..').fsPath);

            // 確保 .vscode 目錄存在
            await vscode.workspace.fs.createDirectory(dirUri);

            // 建立預設檔案
            const content = JSON.stringify(defaultPrompts, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            this.prompts = defaultPrompts;

            vscode.window.showInformationMessage(`✨ 已在 ${this.promptsFilePath} 建立預設 Prompt 檔案`);
        } catch (error) {
            console.error('Failed to create default prompts file:', error);
            throw error;
        }
    }

    getTreeItem(element: PromptTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PromptTreeItem): Promise<PromptTreeItem[]> {
        if (!element) {
            // 返回 Prompts 列表
            const sorted = sortPrompts(this.prompts);

            // 直接使用 p.meta.totalVersions，無需非同步讀取
            return sorted.map(p => {
                const totalVersions = p.meta?.totalVersions ?? 0;
                return new PromptItem(p, totalVersions);
            });
        } else if (element instanceof PromptItem) {
            // 返回版本歷史
            return this.getVersionHistory(element.prompt.id);
        }

        return [];
    }

    /**
     * 更新 Prompt 的 Metadata (由 VersionHistoryService 呼叫)
     */
    async updatePromptMetadata(promptId: string, meta: { totalVersions: number; latestVersionId?: string }): Promise<void> {
        const prompt = this.prompts.find(p => p.id === promptId);
        if (prompt) {
            prompt.meta = meta;
            // 這裡不需要呼叫 refresh()，因為通常 VersionHistoryService 操作完後會觸發 refresh
            // 但我們必須儲存 prompts.json
            await this.savePrompts();
        }
    }

    private async savePrompts(): Promise<void> {
        try {
            const uri = vscode.Uri.file(this.promptsFilePath);
            const content = JSON.stringify(this.prompts, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            this._onPromptsChanged.fire(); // 通知 FileSystem 同步
        } catch (error) {
            console.error('Failed to save prompts:', error);
            throw error;
        }
    }

    getPrompts(): Prompt[] {
        return this.prompts;
    }

    async addPrompt(title: string, content: string, titleSource?: 'user' | 'ai') {
        await this.addPromptWithOption(title, content, false, titleSource);
    }

    // 重構 addPrompt 以支援 silent 模式
    async addPromptWithOption(
        title: string,
        content: string,
        silent: boolean = false,
        titleSource?: 'user' | 'ai'
    ): Promise<void> {
        const today = getTodayISOString();
        const newId = generatePromptId(this.prompts);
        const newPrompt: Prompt = {
            id: newId,
            title,
            content,
            use_count: 0,
            last_used: today,
            created_at: today,
            pinned: false,
            titleSource
        };
        this.prompts.push(newPrompt);
        await this.savePrompts();
        await this.refresh();

        if (!silent) {
            vscode.window.showInformationMessage(I18n.getMessage('message.promptAdded', title));
        } else {
            vscode.window.setStatusBarMessage(`✅ Prompt Saved: ${title}`, 3000);
        }
    }

    // 增加使用次數
    async incrementUseCount(promptId: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === promptId);
        if (prompt) {
            prompt.use_count++;
            prompt.last_used = getTodayISOString();
            await this.savePrompts();
            await this.refresh();
        }
    }

    async deletePrompt(item: PromptItem): Promise<void> {
        const index = this.prompts.findIndex(p => p.id === item.prompt.id);
        if (index !== -1) {
            this.prompts.splice(index, 1);
            await this.savePrompts();
            await this.versionHistoryService.deleteHistory(item.prompt.id);
            await this.secretStorage.delete(item.prompt.id);
            await this.refresh();
            vscode.window.setStatusBarMessage(I18n.getMessage('message.promptDeleted', item.prompt.title), 2000);
        }
    }

    async togglePin(item: PromptItem): Promise<void> {
        const prompt = this.prompts.find(p => p.id === item.prompt.id);
        if (prompt) {
            prompt.pinned = !prompt.pinned;
            await this.savePrompts();
            await this.refresh();
        }
    }

    async updatePromptContent(id: string, content: string, skipVersionCreation: boolean = false): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            // Create new version before updating, unless skipped
            if (!skipVersionCreation) {
                await this.versionHistoryService.createVersion(id, {
                    content: content,
                    changeType: 'edit'
                });
            }

            prompt.content = content;
            await this.savePrompts();
            await this.refresh();
        }
    }

    async maskPromptContent(id: string, maskedContent: string, tokenMap: Record<string, string>): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (!prompt) { return; }

        const types = [...new Set(
            Object.keys(tokenMap)
                .map(label => label.match(/\[([A-Z_]+)-\d+\]/)?.[1])
                .filter((t): t is string => !!t)
        )];

        // Store tokenMap in OS-encrypted SecretStorage — never written to disk
        await this.secretStorage.store(id, tokenMap);

        prompt.content = maskedContent;
        prompt.privacyMeta = { maskedAt: Date.now(), types };
        await this.savePrompts();
        await this.refresh();
    }

    async unmaskPromptContent(id: string): Promise<boolean> {
        const prompt = this.prompts.find(p => p.id === id);
        if (!prompt?.privacyMeta) { return false; }

        const tokenMap = await this.secretStorage.retrieve(id);
        if (!tokenMap) { return false; }

        let content = prompt.content;
        for (const [label, original] of Object.entries(tokenMap)) {
            content = content.split(label).join(original);
        }

        prompt.content = content;
        delete prompt.privacyMeta;
        await this.secretStorage.delete(id);
        await this.savePrompts();
        await this.refresh();
        return true;
    }

    async updatePromptTitle(id: string, title: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.title = title;
            await this.savePrompts();
            await this.refresh();
        }
    }


    // 將 Prompt 加入安全白名單 (不再顯示警告)
    async ignorePromptWarning(id: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.ignorePrivacyWarning = true;
            await this.savePrompts();
            await this.refresh();
            vscode.window.setStatusBarMessage(`✅ 防護警示已忽略`, 2000);
        }
    }

    // 重新啟用安全警告
    async restorePromptWarning(id: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.ignorePrivacyWarning = false;
            await this.savePrompts();
            await this.refresh();
            vscode.window.setStatusBarMessage(`✅ 隱私防護警示已重新啟用`, 2000);
        }
    }

    // 上移 Prompt
    async moveUp(item: PromptItem): Promise<void> {
        const index = this.prompts.findIndex(p => p.id === item.prompt.id);
        if (index > 0) {
            // 交換位置
            [this.prompts[index - 1], this.prompts[index]] = [this.prompts[index], this.prompts[index - 1]];

            // 更新 order 欄位
            this.prompts.forEach((p, i) => p.order = i);

            await this.savePrompts();
            await this.refresh();
            vscode.window.setStatusBarMessage(`✅ 已上移: ${item.prompt.title}`, 2000);
        }
    }

    // 下移 Prompt
    async moveDown(item: PromptItem): Promise<void> {
        const index = this.prompts.findIndex(p => p.id === item.prompt.id);
        if (index < this.prompts.length - 1 && index !== -1) {
            // 交換位置
            [this.prompts[index], this.prompts[index + 1]] = [this.prompts[index + 1], this.prompts[index]];

            // 更新 order 欄位
            this.prompts.forEach((p, i) => p.order = i);

            await this.savePrompts();
            await this.refresh();
            vscode.window.setStatusBarMessage(`✅ 已下移: ${item.prompt.title}`, 2000);
        }
    }

    /**
     * Get version history for a prompt as TreeItems
     */
    private async getVersionHistory(promptId: string): Promise<VersionItem[]> {
        const history = await this.versionHistoryService.loadHistory(promptId);

        return history.versions.map(version =>
            new VersionItem(
                promptId,
                version,
                version.versionId === history.currentVersionId
            )
        );
    }
}

export class PromptItem extends vscode.TreeItem {
    constructor(
        public readonly prompt: Prompt,
        versionCount: number = 0
    ) {
        // Set collapsible state based on version count
        super(
            prompt.title,
            versionCount > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        // 計算相對時間
        const timeText = formatRelativeTime(prompt.last_used);

        // Build description with use count and version count
        const useCountText = I18n.getMessage('status.useCount', prompt.use_count.toString());
        const versionCountText = versionCount > 0 ? ` • ${versionCount} 個版本` : '';
        this.description = useCountText + versionCountText;

        this.tooltip = `${prompt.content}\n\n${useCountText}${versionCountText}\n${I18n.getMessage('status.lastUsed', timeText)}`;

        // 根據使用次數設定圖示 (預設)
        this.iconPath = getPromptIcon(prompt);
        this.contextValue = 'promptItem';

        // 隱私與遮罩狀態判定
        const hasReversibleMask = !!prompt.privacyMeta;
        const hasLegacyMaskToken = !hasReversibleMask && PatternEngine.hasMaskedTokens(prompt.content);
        const hasRawSensitiveData = !hasReversibleMask && !hasLegacyMaskToken && PatternEngine.detect(prompt.content);

        if (hasReversibleMask) {
            // 狀態 1: 已遮罩 (綠色盾牌)
            const maskedTypes = prompt.privacyMeta?.types.join(', ') ?? '';
            const typesLine = maskedTypes ? `\nTypes: ${maskedTypes}` : '';
            this.iconPath = new vscode.ThemeIcon("shield", new vscode.ThemeColor("testing.iconPassed"));
            this.tooltip = `${prompt.content}\n\n🛡️ Sensitive Data Masked${typesLine}\n${useCountText}${versionCountText}\n${I18n.getMessage('status.lastUsed', timeText)}`;
            this.contextValue = 'promptItem_protected';
        } else if (hasLegacyMaskToken) {
            // 狀態 2: 舊資料已遮罩但缺少對照表 (不可還原)
            this.iconPath = new vscode.ThemeIcon("shield", new vscode.ThemeColor("problemsWarningIcon.foreground"));
            this.tooltip = `${prompt.content}\n\n⚠ Masked tokens found, but mapping is missing (cannot unmask)\n${useCountText}${versionCountText}\n${I18n.getMessage('status.lastUsed', timeText)}`;
            this.contextValue = 'promptItem_masked_unrestorable';
        } else if (prompt.ignorePrivacyWarning && hasRawSensitiveData) {
            // 狀態 3: 使用者選擇忽略警報 (白名單)
            this.contextValue = 'promptItem_ignored';
        } else if (hasRawSensitiveData) {
            // 狀態 4: 含裸露敏感資料，尚未遮罩 (黃色盾牌)
            this.iconPath = new vscode.ThemeIcon("shield", new vscode.ThemeColor("problemsWarningIcon.foreground"));
            this.tooltip = `${prompt.content}\n\n⚠ Contains sensitive data (Maskable)\n${useCountText}${versionCountText}\n${I18n.getMessage('status.lastUsed', timeText)}`;
            this.contextValue = 'promptItem_maskable';
        }
    }
}
