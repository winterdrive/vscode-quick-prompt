import * as vscode from 'vscode';
import { Prompt } from './promptProvider';

/**
 * 虛擬檔案系統提供者
 * 將每個 Prompt 映射為一個虛擬檔案 (quickprompt:/xxx.md)
 * 讓使用者可以像編輯真實檔案一樣編輯 Prompt
 */
export class PromptFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    // 記憶體快取：存放所有 Prompt 的內容
    private fileCache = new Map<string, Uint8Array>();

    // 回調函數：用於與 PromptProvider 同步資料
    private onPromptUpdateCallback?: (id: string, content: string) => void;
    private getPromptsCallback?: () => Prompt[];

    constructor() { }

    /**
     * 設定回調函數，讓 FileSystem 可以與 PromptProvider 互動
     */
    setCallbacks(
        onUpdate: (id: string, content: string) => void,
        getPrompts: () => Prompt[]
    ) {
        this.onPromptUpdateCallback = onUpdate;
        this.getPromptsCallback = getPrompts;
        this.rebuildCache();
    }

    /**
     * 重建快取：從 PromptProvider 同步所有 Prompt
     */
    rebuildCache() {
        if (!this.getPromptsCallback) return;

        this.fileCache.clear();
        const prompts = this.getPromptsCallback();

        prompts.forEach(prompt => {
            const uri = this.getUriForPrompt(prompt.id);
            const content = new TextEncoder().encode(prompt.content);
            this.fileCache.set(uri.path, content);
        });
    }

    /**
     * 根據 Prompt ID 生成虛擬 URI
     */
    getUriForPrompt(promptId: string): vscode.Uri {
        return vscode.Uri.parse(`quickprompt:/${promptId}.md`);
    }

    /**
     * 從 URI 解析出 Prompt ID
     */
    private getPromptIdFromUri(uri: vscode.Uri): string {
        // 移除開頭的 '/' 和結尾的 '.md'
        return uri.path.substring(1).replace(/\.md$/, '');
    }

    // ==================== FileSystemProvider 介面實作 ====================

    watch(uri: vscode.Uri): vscode.Disposable {
        // 簡化實作：不需要真正的檔案監聽
        return new vscode.Disposable(() => { });
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        let content = this.fileCache.get(uri.path);

        // 如果快取沒有命中，嘗試即時從 Provider 獲取
        if (!content && this.getPromptsCallback) {
            const promptId = this.getPromptIdFromUri(uri);
            const prompts = this.getPromptsCallback();
            const prompt = prompts.find(p => p.id === promptId);

            if (prompt) {
                // 更新快取
                content = new TextEncoder().encode(prompt.content);
                this.fileCache.set(uri.path, content);
            }
        }

        if (!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: content.length
        };
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        // 不支援目錄列表（我們只有單層檔案）
        return [];
    }

    createDirectory(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions('不支援建立目錄');
    }

    readFile(uri: vscode.Uri): Uint8Array {
        let content = this.fileCache.get(uri.path);

        // 如果快取沒有命中，嘗試即時從 Provider 獲取
        if (!content && this.getPromptsCallback) {
            const promptId = this.getPromptIdFromUri(uri);
            const prompts = this.getPromptsCallback();
            const prompt = prompts.find(p => p.id === promptId);

            if (prompt) {
                // 更新快取
                content = new TextEncoder().encode(prompt.content);
                this.fileCache.set(uri.path, content);
            }
        }

        if (!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        return content;
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
        const promptId = this.getPromptIdFromUri(uri);
        const textContent = new TextDecoder().decode(content);

        // 更新快取
        this.fileCache.set(uri.path, content);

        // 通知 PromptProvider 更新資料
        if (this.onPromptUpdateCallback) {
            this.onPromptUpdateCallback(promptId, textContent);
        }

        // 觸發檔案變更事件
        this._emitter.fire([{
            type: vscode.FileChangeType.Changed,
            uri
        }]);
    }

    delete(uri: vscode.Uri): void {
        this.fileCache.delete(uri.path);

        this._emitter.fire([{
            type: vscode.FileChangeType.Deleted,
            uri
        }]);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri): void {
        const content = this.fileCache.get(oldUri.path);
        if (!content) {
            throw vscode.FileSystemError.FileNotFound(oldUri);
        }

        this.fileCache.set(newUri.path, content);
        this.fileCache.delete(oldUri.path);

        this._emitter.fire([
            { type: vscode.FileChangeType.Deleted, uri: oldUri },
            { type: vscode.FileChangeType.Created, uri: newUri }
        ]);
    }
}
