import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CLIPBOARD_CONSTANTS } from './utils/constants';
export interface ClipboardHistoryItem {
    id: string;              // 唯一識別碼
    content: string;         // 剪貼簿內容
    preview: string;         // 預覽文字（前 50 字）
    timestamp: number;       // 時間戳記（毫秒）
    source: 'vscode' | 'external';  // 來源
    length: number;          // 內容長度
}

export class ClipboardManager {
    private history: ClipboardHistoryItem[] = [];
    private lastClipboard: string = '';
    private pollingInterval: NodeJS.Timeout | null = null;
    private isVSCodeActive: boolean = true;

    private _onHistoryChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onHistoryChanged: vscode.Event<void> = this._onHistoryChanged.event;

    constructor(private context: vscode.ExtensionContext) {
        this.loadHistory();
        this.setupListeners();
    }

    /**
     * 設定所有監聽器
     */
    private setupListeners() {
        // 1. 視窗焦點監聽
        this.registerWindowFocusListener();

        // 2. 輕量級輪詢（可選）
        this.startPollingIfEnabled();

        // 3. 初始檢查（啟動時檢查一次）
        setTimeout(() => {
            this.checkClipboard('external');
        }, CLIPBOARD_CONSTANTS.STARTUP_CHECK_DELAY_MS);
    }

    /**
     * 註冊即時捕捉監聽器（從 extension.ts 呼叫）
     * 監聽選取變化來推測複製行為
     */
    registerInstantCapture(subscriptions: vscode.Disposable[]) {
        // 監聽選取變化
        let lastSelection: string = '';

        const selectionListener = vscode.window.onDidChangeTextEditorSelection(async (event) => {
            const editor = event.textEditor;
            const selection = editor.document.getText(editor.selection);

            // 如果選取內容改變，延遲檢查剪貼簿
            if (selection && selection !== lastSelection && selection.length > CLIPBOARD_CONSTANTS.MIN_SELECTION_LENGTH) {
                lastSelection = selection;

                // 延遲檢查（給使用者時間按 Ctrl+C）
                setTimeout(async () => {
                    const clipboard = await vscode.env.clipboard.readText();
                    // 如果剪貼簿內容與選取內容相同，代表使用者複製了
                    if (clipboard === selection) {
                        await this.addToHistory(clipboard, 'vscode');
                    }
                }, CLIPBOARD_CONSTANTS.CLIPBOARD_CHECK_DELAY_MS);
            }
        });

        subscriptions.push(selectionListener);
    }

    /**
     * 視窗焦點監聽 - 當 VSCode 獲得焦點時檢查剪貼簿
     */
    private registerWindowFocusListener() {
        vscode.window.onDidChangeWindowState((state) => {
            this.isVSCodeActive = state.focused;

            if (state.focused) {
                // VSCode 獲得焦點時，檢查剪貼簿（來源標記為外部）
                this.checkClipboard('external');

                // 啟動輪詢（如果已啟用）
                this.startPollingIfEnabled();
            } else {
                // VSCode 失去焦點時停止輪詢
                this.stopPolling();
            }
        });
    }

    /**
     * 輕量級輪詢 - 僅在 VSCode 活躍時執行
     */
    private startPollingIfEnabled() {
        const config = vscode.workspace.getConfiguration('quickPrompt.clipboardHistory');
        const enabled = config.get<boolean>('enabled', true);
        const pollingEnabled = config.get<boolean>('enablePolling', true);
        const interval = config.get<number>('pollingInterval', 5000);

        if (!enabled || !pollingEnabled) {
            return;
        }

        // 避免重複啟動
        if (this.pollingInterval) {
            return;
        }

        this.pollingInterval = setInterval(() => {
            if (this.isVSCodeActive) {
                this.checkClipboard('external');
            }
        }, interval);
    }

    /**
     * 停止輪詢
     */
    private stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * 檢查剪貼簿是否有新內容
     */
    async checkClipboard(source: 'vscode' | 'external' = 'external') {
        const config = vscode.workspace.getConfiguration('quickPrompt.clipboardHistory');
        const enabled = config.get<boolean>('enabled', true);

        if (!enabled) {
            return;
        }

        try {
            const current = await vscode.env.clipboard.readText();
            if (this.shouldAddToHistory(current)) {
                await this.addToHistory(current, source);
            }
        } catch (error) {
            // 剪貼簿讀取失敗（可能是權限問題），靜默忽略
            console.error('Failed to read clipboard:', error);
        }
    }

    /**
     * 判斷是否應該新增到歷史
     */
    private shouldAddToHistory(content: string): boolean {
        return this.isContentValid(content) &&
            !this.isDuplicate(content) &&
            this.meetsMinLength(content) &&
            !this.isInRecentHistory(content) &&
            !this.isPureNumber(content);
    }

    /**
     * 檢查內容是否有效（非空）
     */
    private isContentValid(content: string): boolean {
        return !!content && content.trim().length > 0;
    }

    /**
     * 檢查是否與上一筆重複
     */
    private isDuplicate(content: string): boolean {
        return content === this.lastClipboard;
    }

    /**
     * 檢查是否符合最小長度要求
     */
    private meetsMinLength(content: string): boolean {
        const config = vscode.workspace.getConfiguration('quickPrompt.clipboardHistory');
        const minLength = config.get<number>('minLength', CLIPBOARD_CONSTANTS.MIN_SELECTION_LENGTH);
        return content.trim().length >= minLength;
    }

    /**
     * 檢查是否在最近的歷史記錄中
     */
    private isInRecentHistory(content: string): boolean {
        const recentHistory = this.history.slice(0, CLIPBOARD_CONSTANTS.RECENT_HISTORY_CHECK_COUNT);
        return recentHistory.some(item => item.content === content);
    }

    /**
     * 檢查是否為純數字
     */
    private isPureNumber(content: string): boolean {
        return /^\d+$/.test(content.trim());
    }

    /**
     * 新增到歷史
     */
    async addToHistory(content: string, source: 'vscode' | 'external') {
        if (!this.shouldAddToHistory(content)) {
            return;
        }

        const config = vscode.workspace.getConfiguration('quickPrompt.clipboardHistory');
        const maxItems = config.get<number>('maxItems', 20);

        // 建立新項目（儲存原始內容，遮罩在 prompt 插入層處理）
        const newItem: ClipboardHistoryItem = {
            id: this.generateId(),
            content: content,
            preview: this.generatePreview(content),
            timestamp: Date.now(),
            source: source,
            length: content.length
        };

        // 新增到歷史開頭
        this.history.unshift(newItem);

        // 更新最後剪貼簿內容
        this.lastClipboard = content;

        // 限制最大筆數
        if (this.history.length > maxItems) {
            this.history = this.history.slice(0, maxItems);
        }

        // 儲存並通知
        this.saveHistory();
        this._onHistoryChanged.fire();
    }

    /**
     * 產生唯一 ID
     */
    private generateId(): string {
        return `clip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * 產生預覽文字
     */
    private generatePreview(content: string): string {
        // 移除換行，取指定長度
        return content.replace(/[\r\n]+/g, ' ').substring(0, CLIPBOARD_CONSTANTS.PREVIEW_MAX_LENGTH).trim();
    }

    /**
     * 取得歷史記錄
     */
    getHistory(): ClipboardHistoryItem[] {
        return [...this.history];
    }

    /**
     * 從歷史移除
     */
    removeFromHistory(id: string) {
        const index = this.history.findIndex(item => item.id === id);
        if (index !== -1) {
            this.history.splice(index, 1);
            this.saveHistory();
            this._onHistoryChanged.fire();
        }
    }

    /**
     * 清空歷史
     */
    clearHistory() {
        this.history = [];
        this.lastClipboard = '';
        this.saveHistory();
        this._onHistoryChanged.fire();
    }

    /**
     * 取得檔案存放路徑
     */
    private getStoragePath(): string {
        const dir = path.join(os.homedir(), '.quickprompt');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return path.join(dir, 'clipboard-history.json');
    }

    /**
     * 載入歷史（從 ~/.quickprompt/clipboard-history.json）
     */
    private loadHistory() {
        const storagePath = this.getStoragePath();
        
        // 嘗試從新架構檔案讀取
        if (fs.existsSync(storagePath)) {
            try {
                const data = fs.readFileSync(storagePath, 'utf-8');
                this.history = JSON.parse(data);
            } catch (err) {
                console.error('Failed to parse clipboard history file:', err);
                this.history = [];
            }
        } else {
            // 如果檔案不存在，嘗試從舊版 globalState 遷移
            const saved = this.context.globalState.get<ClipboardHistoryItem[]>('clipboardHistory', []);
            this.history = saved;
            if (this.history.length > 0) {
                this.saveHistory(); // 寫入到新架構檔案
            }
        }

        // 初始化 lastClipboard
        if (this.history.length > 0) {
            this.lastClipboard = this.history[0].content;
        }
    }

    /**
     * 儲存歷史（到 ~/.quickprompt/clipboard-history.json）
     */
    private saveHistory() {
        try {
            fs.writeFileSync(this.getStoragePath(), JSON.stringify(this.history, null, 2), 'utf-8');
            // 同時更新 globalState 以防舊版依賴，或可直接移除
            this.context.globalState.update('clipboardHistory', this.history);
        } catch (err) {
            console.error('Failed to save clipboard history file:', err);
        }
    }

    /**
     * 更新指定項目的內容（用於遮罩後寫回）
     */
    updateItemContent(id: string, newContent: string) {
        const item = this.history.find(i => i.id === id);
        if (!item) { return; }
        item.content = newContent;
        item.preview = this.generatePreview(newContent);
        item.length = newContent.length;
        this.saveHistory();
        this._onHistoryChanged.fire();
    }

    /**
     * 銷毀（清理資源）
     */
    dispose() {
        this.stopPolling();
        this._onHistoryChanged.dispose();
    }
}


