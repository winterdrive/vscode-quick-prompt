import * as vscode from 'vscode';
import * as path from 'path';
import { I18n } from './i18n';
import { ClipboardManager } from './ClipboardManager';
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

export interface WorkspaceConfig {
    key: string;
    name: string;
    uri: vscode.Uri;
    promptsFilePath: string;
}

// TreeItem 類型 (支援 PromptItem 和 VersionItem)
export type PromptTreeItem = PromptItem | VersionItem;

export class PromptProvider implements vscode.TreeDataProvider<PromptTreeItem> {
    private static readonly scopeStateKey = 'quickPrompt.activeWorkspaceScope';
    private _onDidChangeTreeData: vscode.EventEmitter<PromptTreeItem | undefined | null | void> = new vscode.EventEmitter<PromptTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PromptTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // 新增：Prompts 資料變更事件（用於同步到 FileSystem）
    private _onPromptsChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onPromptsChanged: vscode.Event<void> = this._onPromptsChanged.event;

    private prompts: Prompt[] = [];
    private workspaceConfigs: WorkspaceConfig[] = [];
    private loadedWorkspaceKeys: Set<string> = new Set();
    private failedWorkspaceKeys: Set<string> = new Set();
    private watchers: vscode.Disposable[] = [];
    private treeView?: vscode.TreeView<PromptTreeItem>;
    private activeWorkspaceScopeKeys: string[] | undefined;
    private clipboardManager?: ClipboardManager;
    private versionHistoryService: VersionHistoryService;
    private secretStorage: SecretStorageManager;
    private _savingCount = 0;

    constructor(private context: vscode.ExtensionContext, versionHistoryService?: VersionHistoryService) {
        this.secretStorage = new SecretStorageManager(context.secrets);
        // 初始化版本歷史服務 (使用傳入的實例，若無則建立新實例 - 但建議由外部傳入以保持單例)
        this.versionHistoryService = versionHistoryService || new VersionHistoryService(context);
        // 注入 PromptProvider 以便 VersionHistoryService 更新 Metadata
        this.versionHistoryService.setPromptProvider(this);
        this.versionHistoryService.setWorkspaceResolver((promptId) => this.resolveVersionHistoryLocation(promptId));

        this.setupWorkspaces();

        // 監聽工作區資料夾變化
        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                this.setupWorkspaces();
                await this.refresh();
            })
        );
    }

    private setupWorkspaces() {
        // 清理舊的 watchers
        this.watchers.forEach(w => w.dispose());
        this.watchers = [];
        this.workspaceConfigs = [];

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            // 用來防止重名
            const nameCount = new Map<string, number>();

            workspaceFolders.forEach(folder => {
                let name = folder.name;
                const count = nameCount.get(name) || 0;
                nameCount.set(name, count + 1);
                if (count > 0) {
                    name = `${name} (${count})`;
                }

                const vscodeDir = vscode.Uri.joinPath(folder.uri, '.vscode');
                const promptsFilePath = vscode.Uri.joinPath(vscodeDir, 'prompts.json').fsPath;

                this.workspaceConfigs.push({
                    key: PromptProvider.getWorkspaceKey(folder.uri),
                    name,
                    uri: folder.uri,
                    promptsFilePath
                });

                // 監聽此 prompts.json
                const watcher = vscode.workspace.createFileSystemWatcher(
                    new vscode.RelativePattern(vscodeDir, 'prompts.json')
                );
                watcher.onDidChange(async () => {
                    if (this._savingCount === 0) {
                        await this.refresh();
                    }
                });
                this.watchers.push(watcher);
                this.context.subscriptions.push(watcher);
            });
        } else {
            // Fallback: Global storage or extension directory
            const promptsFilePath = vscode.Uri.joinPath(this.context.extensionUri, 'prompts.json').fsPath;
            this.workspaceConfigs.push({
                key: 'global',
                name: 'Global',
                uri: this.context.extensionUri,
                promptsFilePath
            });

            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.Uri.file(path.dirname(promptsFilePath)), 'prompts.json')
            );
            watcher.onDidChange(async () => {
                if (this._savingCount === 0) {
                    await this.refresh();
                }
            });
            this.watchers.push(watcher);
            this.context.subscriptions.push(watcher);
        }

        this.activeWorkspaceScopeKeys = this.normalizeWorkspaceScope(
            this.context.workspaceState.get<string[] | undefined>(PromptProvider.scopeStateKey)
        ) ?? this.getInitialWorkspaceScope();
        this.updateTreeViewDescription();
    }

    /**
     * 設定 ClipboardManager 引用
     */
    setClipboardManager(manager: ClipboardManager) {
        this.clipboardManager = manager;

        // 監聽剪貼簿歷史變化：只重繪 TreeView，不重讀磁碟
        manager.onHistoryChanged(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    async refresh(): Promise<void> {
        await this.loadPrompts();
        this._onDidChangeTreeData.fire();
    }

    private async loadPrompts(): Promise<void> {
        let allPrompts: Prompt[] = [];
        const loadedWorkspaceKeys = new Set<string>();
        const failedWorkspaceKeys = new Set<string>();

        for (const config of this.workspaceConfigs) {
            try {
                const uri = vscode.Uri.file(config.promptsFilePath);

                let content: Uint8Array;
                try {
                    content = await vscode.workspace.fs.readFile(uri);
                } catch (error: any) {
                    if (error.code === 'FileNotFound') {
                        continue;
                    } else {
                        throw error;
                    }
                }

                let prompts = JSON.parse(content.toString());
                if (!Array.isArray(prompts)) {
                    throw new Error('prompts.json must contain an array');
                }
                let needsMigration = false;
                const today = getTodayISOString();

                const processedPrompts: Prompt[] = prompts.map((p: any) => {
                    if ('status' in p) {
                        needsMigration = true;
                    }
                    if (!p.meta) {
                        p.meta = { totalVersions: 0 };
                    }

                    const storedId = String(p.id ?? '');
                    const actualId = this.getActualPromptId(storedId);
                    const prefixedId = this.getPrefixedPromptId(config, actualId);

                    return {
                        id: prefixedId,
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
                });

                // 遷移：清除舊格式自動指派的連續 order
                const definedOrders = processedPrompts
                    .map(p => p.order)
                    .filter((o): o is number => o !== undefined);
                if (definedOrders.length === processedPrompts.length) {
                    const sorted = [...definedOrders].sort((a, b) => a - b);
                    const isSequential = sorted.every((o, i) => o === i);
                    if (isSequential) {
                        processedPrompts.forEach(p => { p.order = undefined; });
                        needsMigration = true;
                    }
                }

                if (needsMigration) {
                    console.log(`[PromptProvider] Running schema migration for ${config.name}...`);
                    await this.savePromptsForConfig(config, processedPrompts);
                }

                allPrompts = allPrompts.concat(processedPrompts);
                loadedWorkspaceKeys.add(config.key);
            } catch (error) {
                console.error(`Failed to load prompts for workspace ${config.name}:`, error);
                failedWorkspaceKeys.add(config.key);
            }
        }

        this.prompts = allPrompts;
        this.loadedWorkspaceKeys = loadedWorkspaceKeys;
        this.failedWorkspaceKeys = failedWorkspaceKeys;
    }

    private async createDefaultPromptsFileForConfig(config: WorkspaceConfig): Promise<void> {
        const today = getTodayISOString();
        const defaultPrompts = [
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
            const uri = vscode.Uri.file(config.promptsFilePath);
            const dirUri = vscode.Uri.file(path.dirname(config.promptsFilePath));

            // 確保目錄存在
            await vscode.workspace.fs.createDirectory(dirUri);

            // 建立預設檔案
            const content = JSON.stringify(defaultPrompts, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

            vscode.window.showInformationMessage(`✨ 已在 ${config.name} 建立預設 Prompt 檔案`);
        } catch (error) {
            console.error(`Failed to create default prompts file for ${config.name}:`, error);
            throw error;
        }
    }

    getTreeItem(element: PromptTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PromptTreeItem): Promise<PromptTreeItem[]> {
        if (!element) {
            const sorted = sortPrompts(this.getVisiblePrompts());
            return sorted.map(p => {
                const totalVersions = p.meta?.totalVersions ?? 0;
                return new PromptItem(p, totalVersions, this.getWorkspaceTooltipName(p.id));
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
            await this.savePrompts();
        }
    }

    private async savePrompts(): Promise<void> {
        this._savingCount++;
        try {
            for (const config of this.workspaceConfigs) {
                // 過濾出屬於該 workspace 的 prompts
                const workspacePrompts = this.prompts.filter(p => this.getPromptWorkspaceKey(p.id) === config.key);
                if (!this.loadedWorkspaceKeys.has(config.key) && workspacePrompts.length === 0) {
                    continue;
                }

                // 克隆並將 ID 去前綴
                const cleanPrompts = workspacePrompts.map(p => this.toStoredPrompt(p));

                const uri = vscode.Uri.file(config.promptsFilePath);
                const dirUri = vscode.Uri.file(path.dirname(config.promptsFilePath));
                await vscode.workspace.fs.createDirectory(dirUri);
                const content = JSON.stringify(cleanPrompts, null, 2);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                this.loadedWorkspaceKeys.add(config.key);
            }
            this._onPromptsChanged.fire(); // 通知 FileSystem 同步
        } catch (error) {
            console.error('Failed to save prompts:', error);
            throw error;
        } finally {
            setTimeout(() => { this._savingCount--; }, 300);
        }
    }

    private async savePromptsForConfig(config: WorkspaceConfig, configPrompts: Prompt[]): Promise<void> {
        this._savingCount++;
        try {
            const cleanPrompts = configPrompts.map(p => this.toStoredPrompt(p));
            const uri = vscode.Uri.file(config.promptsFilePath);
            const dirUri = vscode.Uri.file(path.dirname(config.promptsFilePath));
            await vscode.workspace.fs.createDirectory(dirUri);
            const content = JSON.stringify(cleanPrompts, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            this.loadedWorkspaceKeys.add(config.key);
        } catch (error) {
            console.error(`Failed to save prompts for ${config.name}:`, error);
        } finally {
            setTimeout(() => { this._savingCount--; }, 300);
        }
    }

    getPrompts(): Prompt[] {
        return this.prompts;
    }

    getVisiblePrompts(): Prompt[] {
        const activeWorkspaceKeys = new Set(this.getActiveWorkspaceScopeKeys());
        return this.prompts.filter(prompt => {
            const workspaceKey = this.getPromptWorkspaceKey(prompt.id) || this.getDefaultWorkspaceKey();
            return activeWorkspaceKeys.has(workspaceKey);
        });
    }

    public getWorkspaceConfigs(): readonly WorkspaceConfig[] {
        return this.workspaceConfigs;
    }

    public setTreeView(treeView: vscode.TreeView<PromptTreeItem>): void {
        this.treeView = treeView;
        this.updateTreeViewDescription();
    }

    public getWorkspaceNameForPrompt(promptId: string): string | undefined {
        const workspaceKey = this.getPromptWorkspaceKey(promptId);
        if (!workspaceKey) {
            return undefined;
        }

        return this.getWorkspaceConfig(workspaceKey)?.name;
    }

    public getActiveWorkspaceScopeKeys(): string[] {
        if (this.workspaceConfigs.length <= 1) {
            return this.workspaceConfigs.map(config => config.key);
        }

        if (this.activeWorkspaceScopeKeys && this.activeWorkspaceScopeKeys.length === 0) {
            return this.workspaceConfigs.map(config => config.key);
        }

        if (this.activeWorkspaceScopeKeys && this.activeWorkspaceScopeKeys.length > 0) {
            return this.activeWorkspaceScopeKeys;
        }

        const defaultWorkspaceKey = this.getDefaultWorkspaceKey();
        return defaultWorkspaceKey ? [defaultWorkspaceKey] : [];
    }

    public getPickedWorkspaceScopeKeys(): string[] {
        return this.activeWorkspaceScopeKeys ?? this.getActiveWorkspaceScopeKeys();
    }

    public async setActiveWorkspaceScope(workspaceKeys: readonly string[]): Promise<void> {
        const normalized = this.normalizeWorkspaceScope([...workspaceKeys]) ?? [];
        this.activeWorkspaceScopeKeys = normalized;
        await this.context.workspaceState.update(PromptProvider.scopeStateKey, normalized);
        this.updateTreeViewDescription();
        this._onDidChangeTreeData.fire();
    }

    public shouldShowWorkspaceLabels(): boolean {
        return this.workspaceConfigs.length > 1 && this.getActiveWorkspaceScopeKeys().length > 1;
    }

    public getScopeDescription(): string | undefined {
        if (this.workspaceConfigs.length <= 1) {
            return undefined;
        }

        const activeKeys = this.getActiveWorkspaceScopeKeys();
        if (activeKeys.length === this.workspaceConfigs.length) {
            return 'All Workspaces';
        }

        const names = activeKeys
            .map(key => this.getWorkspaceConfig(key)?.name)
            .filter((name): name is string => !!name);

        if (names.length <= 2) {
            return names.join(' + ');
        }

        return `${names.length} workspaces`;
    }

    public getDefaultWorkspaceName(): string {
        return this.getWorkspaceConfig(this.getDefaultWorkspaceKey())?.name || 'Global';
    }

    public getDefaultWorkspaceKey(): string {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (folder) {
                const matched = this.workspaceConfigs.find(c => c.uri.toString() === folder.uri.toString());
                if (matched) {
                    return matched.key;
                }
            }
        }
        return this.workspaceConfigs[0]?.key || 'global';
    }

    async addPrompt(title: string, content: string, titleSource?: 'user' | 'ai') {
        await this.addPromptWithOption(title, content, false, titleSource);
    }

    // 重構 addPrompt 以支援 silent 模式與目標工作區
    async addPromptWithOption(
        title: string,
        content: string,
        silent: boolean = false,
        titleSource?: 'user' | 'ai',
        targetWorkspaceName?: string
    ): Promise<string> {
        const today = getTodayISOString();
        const workspaceKey = targetWorkspaceName || this.getDefaultWorkspaceKey();
        const workspaceConfig = this.getWorkspaceConfig(workspaceKey);
        if (!workspaceConfig) {
            throw new Error(`Workspace not found: ${workspaceKey}`);
        }
        if (this.failedWorkspaceKeys.has(workspaceKey)) {
            throw new Error(`Cannot save prompt because workspace "${workspaceConfig.name}" prompts.json failed to load.`);
        }

        // 過濾出屬於該工作區的 prompts，以計算新的 ID
        const wsPrompts = this.prompts.filter(p => this.getPromptWorkspaceKey(p.id) === workspaceKey);

        // 取得去前綴的 prompts 清單以生成下一號的 ID
        const cleanWsPrompts = wsPrompts.map(p => {
            const colonIndex = p.id.indexOf(':');
            const cleanId = colonIndex !== -1 ? p.id.substring(colonIndex + 1) : p.id;
            return {
                ...p,
                id: cleanId
            };
        });

        const nextActualId = generatePromptId(cleanWsPrompts);
        const prefixedId = this.getPrefixedPromptId(workspaceConfig, nextActualId);

        const newPrompt: Prompt = {
            id: prefixedId,
            title,
            content,
            use_count: 0,
            last_used: today,
            created_at: new Date().toISOString(), // full datetime for accurate sort ordering
            pinned: false,
            titleSource,
            meta: { totalVersions: 0 }
        };
        this.prompts.push(newPrompt);
        await this.savePrompts();
        this._onDidChangeTreeData.fire();

        if (!silent) {
            vscode.window.showInformationMessage(I18n.getMessage('message.promptAdded', title));
        } else {
            vscode.window.setStatusBarMessage(`✅ Prompt Saved: ${title}`, 3000);
        }

        return prefixedId;
    }

    // 增加使用次數
    async incrementUseCount(promptId: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === promptId);
        if (prompt) {
            prompt.use_count++;
            prompt.last_used = getTodayISOString();
            await this.savePrompts();
            this._onDidChangeTreeData.fire();
        }
    }

    async deletePrompt(item: PromptItem): Promise<void> {
        const index = this.prompts.findIndex(p => p.id === item.prompt.id);
        if (index !== -1) {
            this.prompts.splice(index, 1);
            await this.savePrompts();
            await this.versionHistoryService.deleteHistory(item.prompt.id);
            await this.secretStorage.delete(item.prompt.id);
            this._onDidChangeTreeData.fire();
            vscode.window.setStatusBarMessage(I18n.getMessage('message.promptDeleted', item.prompt.title), 2000);
        }
    }

    async togglePin(item: PromptItem): Promise<void> {
        const prompt = this.prompts.find(p => p.id === item.prompt.id);
        if (prompt) {
            prompt.pinned = !prompt.pinned;
            await this.savePrompts();
            this._onDidChangeTreeData.fire();
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
            this._onDidChangeTreeData.fire();
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
        this._onDidChangeTreeData.fire();
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
        this._onDidChangeTreeData.fire();
        return true;
    }

    async updatePromptTitle(id: string, title: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.title = title;
            await this.savePrompts();
            this._onDidChangeTreeData.fire();
        }
    }


    // 將 Prompt 加入安全白名單 (不再顯示警告)
    async ignorePromptWarning(id: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.ignorePrivacyWarning = true;
            await this.savePrompts();
            this._onDidChangeTreeData.fire();
        }
    }

    // 重新啟用 Prompt 隱私警告
    async restorePromptWarning(id: string): Promise<void> {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.ignorePrivacyWarning = false;
            await this.savePrompts();
            this._onDidChangeTreeData.fire();
        }
    }

    // 上移 Prompt
    async moveUp(item: PromptItem): Promise<void> {
        const workspaceKey = this.getPromptWorkspaceKey(item.prompt.id) || this.getDefaultWorkspaceKey();

        // 過濾出屬於該工作區的 prompts 進行排序
        const wsPrompts = this.prompts.filter(p => this.getPromptWorkspaceKey(p.id) === workspaceKey);
        const sorted = sortPrompts(wsPrompts);
        const idx = sorted.findIndex(p => p.id === item.prompt.id);
        if (idx <= 0) { return; }
        if (sorted[idx - 1].pinned && !item.prompt.pinned) { return; } // 不可越過 pinned

        // 首次手動移動：為工作區內所有 prompt 指派基於當前排序的 order
        sorted.forEach((p, i) => { p.order = i; });
        [sorted[idx - 1].order, sorted[idx].order] = [sorted[idx].order, sorted[idx - 1].order];

        await this.savePrompts();
        this._onDidChangeTreeData.fire();
        vscode.window.setStatusBarMessage(`✅ 已上移: ${item.prompt.title}`, 2000);
    }

    // 下移 Prompt
    async moveDown(item: PromptItem): Promise<void> {
        const workspaceKey = this.getPromptWorkspaceKey(item.prompt.id) || this.getDefaultWorkspaceKey();

        // 過濾出屬於該工作區的 prompts 進行排序
        const wsPrompts = this.prompts.filter(p => this.getPromptWorkspaceKey(p.id) === workspaceKey);
        const sorted = sortPrompts(wsPrompts);
        const idx = sorted.findIndex(p => p.id === item.prompt.id);
        if (idx < 0 || idx >= sorted.length - 1) { return; }
        if (item.prompt.pinned && !sorted[idx + 1].pinned) { return; } // pinned 不可移至非 pinned 之後

        sorted.forEach((p, i) => { p.order = i; });
        [sorted[idx].order, sorted[idx + 1].order] = [sorted[idx + 1].order, sorted[idx].order];

        await this.savePrompts();
        this._onDidChangeTreeData.fire();
        vscode.window.setStatusBarMessage(`✅ 已下移: ${item.prompt.title}`, 2000);
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

    private static getWorkspaceKey(uri: vscode.Uri): string {
        return Buffer.from(uri.toString(), 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    private getWorkspaceConfig(workspaceKey: string): WorkspaceConfig | undefined {
        return this.workspaceConfigs.find(config => config.key === workspaceKey);
    }

    private normalizeWorkspaceScope(workspaceKeys: string[] | undefined): string[] | undefined {
        if (!workspaceKeys) {
            return undefined;
        }

        if (this.workspaceConfigs.length <= 1) {
            return this.workspaceConfigs.map(config => config.key);
        }

        const validKeys = new Set(this.workspaceConfigs.map(config => config.key));
        const normalized = [...new Set(workspaceKeys)].filter(key => validKeys.has(key));
        if (normalized.length === 0 || normalized.length === this.workspaceConfigs.length) {
            return [];
        }

        return normalized;
    }

    private getInitialWorkspaceScope(): string[] {
        if (this.workspaceConfigs.length <= 1) {
            return this.workspaceConfigs.map(config => config.key);
        }

        const defaultWorkspaceKey = this.getDefaultWorkspaceKey();
        return defaultWorkspaceKey ? [defaultWorkspaceKey] : [];
    }

    private getWorkspaceTooltipName(promptId: string): string | undefined {
        return this.workspaceConfigs.length > 1 ? this.getWorkspaceNameForPrompt(promptId) : undefined;
    }

    private updateTreeViewDescription(): void {
        if (this.treeView) {
            this.treeView.description = this.getScopeDescription();
        }
    }

    private getPrefixedPromptId(config: WorkspaceConfig, actualId: string): string {
        return `${config.key}:${actualId}`;
    }

    private getPromptWorkspaceKey(promptId: string): string | undefined {
        const colonIndex = promptId.indexOf(':');
        return colonIndex === -1 ? undefined : promptId.substring(0, colonIndex);
    }

    private getActualPromptId(promptId: string): string {
        const colonIndex = promptId.indexOf(':');
        return colonIndex === -1 ? promptId : promptId.substring(colonIndex + 1);
    }

    private toStoredPrompt(prompt: Prompt): Prompt {
        return {
            ...prompt,
            id: this.getActualPromptId(prompt.id)
        };
    }

    private resolveVersionHistoryLocation(promptId: string): { promptId: string; historyDir: string; cacheKey: string } | undefined {
        const workspaceKey = this.getPromptWorkspaceKey(promptId);
        if (!workspaceKey) {
            return undefined;
        }

        const config = this.getWorkspaceConfig(workspaceKey);
        if (!config) {
            return undefined;
        }

        return {
            promptId: this.getActualPromptId(promptId),
            historyDir: vscode.Uri.joinPath(config.uri, '.vscode', '.quickprompt', 'history').fsPath,
            cacheKey: promptId
        };
    }
}

export class PromptItem extends vscode.TreeItem {
    constructor(
        public readonly prompt: Prompt,
        versionCount: number = 0,
        workspaceName?: string
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

        // Tooltip: metadata first so it's always visible, then truncated content
        const MAX_PREVIEW = 300;
        const contentPreview = prompt.content.length > MAX_PREVIEW
            ? `${prompt.content.slice(0, MAX_PREVIEW)}...`
            : prompt.content;
        const workspaceLine = workspaceName ? `Workspace: ${workspaceName}\n` : '';
        const metaLine = `${useCountText}${versionCountText}  |  ${I18n.getMessage('status.lastUsed', timeText)}`;
        this.tooltip = `${workspaceLine}${metaLine}\n\n${contentPreview}`;

        // 點擊 item 直接開啟編輯畫面
        this.command = {
            command: 'quickPrompt.editPrompt',
            title: 'Edit Prompt',
            arguments: [this]
        };

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
            const typesLine = maskedTypes ? `  |  Types: ${maskedTypes}` : '';
            this.iconPath = new vscode.ThemeIcon("shield", new vscode.ThemeColor("testing.iconPassed"));
            this.tooltip = `${workspaceLine}🛡️ Sensitive Data Masked${typesLine}\n${metaLine}\n\n${contentPreview}`;
            this.contextValue = 'promptItem_protected';
        } else if (hasLegacyMaskToken) {
            // 狀態 2: 舊資料已遮罩但缺少對照表 (不可還原)
            this.iconPath = new vscode.ThemeIcon("shield", new vscode.ThemeColor("problemsWarningIcon.foreground"));
            this.tooltip = `${workspaceLine}⚠ Masked tokens found, but mapping is missing (cannot unmask)\n${metaLine}\n\n${contentPreview}`;
            this.contextValue = 'promptItem_masked_unrestorable';
        } else if (prompt.ignorePrivacyWarning && hasRawSensitiveData) {
            // 狀態 3: 使用者選擇忽略警報 (白名單)
            this.contextValue = 'promptItem_ignored';
        } else if (hasRawSensitiveData) {
            // 狀態 4: 含裸露敏感資料，尚未遮罩 (黃色盾牌)
            this.iconPath = new vscode.ThemeIcon("shield", new vscode.ThemeColor("problemsWarningIcon.foreground"));
            this.tooltip = `${workspaceLine}⚠ Contains sensitive data (Maskable)\n${metaLine}\n\n${contentPreview}`;
            this.contextValue = 'promptItem_maskable';
        }
    }
}
