/**
 * Privacy Dictionary Manager
 * Manages custom masking rules with highest priority
 * Quick Prompt v0.3.0 - Phase 2
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DictionaryEntry, MaskToken, MaskType } from '../types';
import { PatternEngine } from '../masking/patternEngine';

/**
 * 字典管理器
 * 管理自訂遮罩規則，具有最高優先級
 */
export class DictionaryManager {
    private entries: Map<string, DictionaryEntry> = new Map();
    private dictionaryPath: string = '';
    private watcher: vscode.FileSystemWatcher | null = null;

    private _onDictionaryChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDictionaryChanged: vscode.Event<void> = this._onDictionaryChanged.event;

    constructor(private workspaceRoot: string) {
        this.initializeDictionaryPath();
    }

    /**
     * 初始化字典路徑
     */
    private initializeDictionaryPath(): void {
        const config = vscode.workspace.getConfiguration('quickPrompt.privacy');
        const relativePath = config.get<string>('dictionaryPath', '.vscode/privacy-dictionary.json');
        this.dictionaryPath = path.join(this.workspaceRoot, relativePath);
    }

    /**
     * 載入字典
     */
    async load(): Promise<void> {
        try {
            // 檢查檔案是否存在
            try {
                await fs.access(this.dictionaryPath);
            } catch {
                // 檔案不存在，建立預設字典
                await this.createDefaultDictionary();
                return;
            }

            // 讀取並解析 JSON
            const content = await fs.readFile(this.dictionaryPath, 'utf-8');
            const data = JSON.parse(content);

            // 驗證格式
            if (!data.version || !Array.isArray(data.entries)) {
                throw new Error('Invalid dictionary format');
            }

            // 載入條目
            this.entries.clear();
            for (const entry of data.entries) {
                this.entries.set(entry.id, entry);
            }

            console.log(`[DictionaryManager] Loaded ${this.entries.size} entries from ${this.dictionaryPath}`);

        } catch (error) {
            console.error('[DictionaryManager] Failed to load dictionary:', error);
            // 載入失敗時建立新字典
            await this.createDefaultDictionary();
        }
    }

    /**
     * 儲存字典
     */
    async save(): Promise<void> {
        try {
            // 確保目錄存在
            const dir = path.dirname(this.dictionaryPath);
            await fs.mkdir(dir, { recursive: true });

            // 準備資料
            const data = {
                version: '1.0',
                description: 'Quick Prompt Privacy Dictionary',
                lastModified: new Date().toISOString(),
                entries: Array.from(this.entries.values()).sort((a, b) => 
                    b.updatedAt - a.updatedAt
                )
            };

            // 寫入檔案（格式化 JSON）
            await fs.writeFile(
                this.dictionaryPath,
                JSON.stringify(data, null, 2),
                'utf-8'
            );

            console.log(`[DictionaryManager] Saved ${this.entries.size} entries to ${this.dictionaryPath}`);

            // 觸發變更事件
            this._onDictionaryChanged.fire();

        } catch (error) {
            console.error('[DictionaryManager] Failed to save dictionary:', error);
            throw new Error('Failed to save privacy dictionary');
        }
    }

    /**
     * 建立預設字典
     */
    private async createDefaultDictionary(): Promise<void> {
        const defaultEntries: DictionaryEntry[] = [
            {
                id: this.generateId(),
                pattern: 'example@company.com',
                isRegex: false,
                label: '[COMPANY-EMAIL]',
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                note: 'Example: Replace company email'
            },
            {
                id: this.generateId(),
                pattern: 'John (Smith|Doe)',
                isRegex: true,
                label: '[PERSON-NAME]',
                enabled: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                note: 'Example: Replace person names (regex)'
            }
        ];

        for (const entry of defaultEntries) {
            this.entries.set(entry.id, entry);
        }

        await this.save();
    }

    /**
     * 新增條目
     */
    async addEntry(entry: Omit<DictionaryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<DictionaryEntry> {
        // 驗證模式
        if (entry.isRegex) {
            if (!PatternEngine.validateRegex(entry.pattern)) {
                throw new Error('Invalid or dangerous regex pattern');
            }
        }

        const newEntry: DictionaryEntry = {
            ...entry,
            id: this.generateId(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.entries.set(newEntry.id, newEntry);
        await this.save();

        return newEntry;
    }

    /**
     * 更新條目
     */
    async updateEntry(id: string, updates: Partial<DictionaryEntry>): Promise<DictionaryEntry> {
        const entry = this.entries.get(id);
        
        if (!entry) {
            throw new Error(`Dictionary entry not found: ${id}`);
        }

        // 如果更新模式，驗證正則表達式
        if (updates.pattern && updates.isRegex) {
            if (!PatternEngine.validateRegex(updates.pattern)) {
                throw new Error('Invalid or dangerous regex pattern');
            }
        }

        const updatedEntry: DictionaryEntry = {
            ...entry,
            ...updates,
            updatedAt: Date.now()
        };

        this.entries.set(id, updatedEntry);
        await this.save();

        return updatedEntry;
    }

    /**
     * 刪除條目
     */
    async deleteEntry(id: string): Promise<boolean> {
        const deleted = this.entries.delete(id);
        
        if (deleted) {
            await this.save();
        }

        return deleted;
    }

    /**
     * 取得單一條目
     */
    getEntry(id: string): DictionaryEntry | undefined {
        return this.entries.get(id);
    }

    /**
     * 取得所有條目
     */
    getAllEntries(): DictionaryEntry[] {
        return Array.from(this.entries.values()).sort((a, b) => 
            b.updatedAt - a.updatedAt
        );
    }

    /**
     * 取得啟用的條目
     */
    getEnabledEntries(): DictionaryEntry[] {
        return this.getAllEntries().filter(entry => entry.enabled);
    }

    /**
     * 搜尋條目
     */
    searchEntries(query: string): DictionaryEntry[] {
        const lowerQuery = query.toLowerCase();
        return this.getAllEntries().filter(entry => 
            entry.pattern.toLowerCase().includes(lowerQuery) ||
            entry.label.toLowerCase().includes(lowerQuery) ||
            (entry.note && entry.note.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * 執行字典遮罩
     * @param text 原始文字
     * @returns 遮罩結果
     */
    mask(text: string): { maskedText: string; tokens: MaskToken[] } {
        const tokens: MaskToken[] = [];
        let maskedText = text;
        
        // 取得啟用的條目（按更新時間排序，最新的優先）
        const enabledEntries = this.getEnabledEntries();
        
        // 記錄已遮罩的範圍
        const maskedRanges: Array<{ start: number; end: number }> = [];

        for (const entry of enabledEntries) {
            try {
                let regex: RegExp;
                
                if (entry.isRegex) {
                    regex = new RegExp(entry.pattern, 'g');
                } else {
                    // 純文字：轉義特殊字元
                    const escaped = entry.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    regex = new RegExp(escaped, 'g');
                }

                const matches = Array.from(maskedText.matchAll(regex));

                for (const match of matches) {
                    if (!match.index) continue;

                    const start = match.index;
                    const end = start + match[0].length;

                    // 檢查是否已被遮罩
                    if (this.isOverlapping(start, end, maskedRanges)) {
                        continue;
                    }

                    // 建立遮罩 token
                    const token: MaskToken = {
                        id: this.generateTokenId(),
                        originalValue: match[0],
                        maskedValue: entry.label,
                        type: MaskType.CUSTOM,
                        createdAt: Date.now(),
                        reversible: true
                    };

                    tokens.push(token);

                    // 替換文字
                    maskedText = maskedText.substring(0, start) + token.maskedValue + maskedText.substring(end);

                    // 記錄已遮罩範圍
                    maskedRanges.push({ start, end });

                    // 調整後續匹配位置
                    const lengthDiff = token.maskedValue.length - match[0].length;
                    maskedRanges.forEach(range => {
                        if (range.start > start) {
                            range.start += lengthDiff;
                            range.end += lengthDiff;
                        }
                    });
                }

            } catch (error) {
                console.error(`[DictionaryManager] Error processing entry ${entry.id}:`, error);
                continue;
            }
        }

        return { maskedText, tokens };
    }

    /**
     * 檢查範圍是否重疊
     */
    private isOverlapping(start: number, end: number, ranges: Array<{ start: number; end: number }>): boolean {
        return ranges.some(range => {
            return (start >= range.start && start < range.end) ||
                   (end > range.start && end <= range.end) ||
                   (start <= range.start && end >= range.end);
        });
    }

    /**
     * 啟用文件監控
     */
    enableFileWatcher(): void {
        if (this.watcher) {
            return;
        }

        const pattern = new vscode.RelativePattern(
            this.workspaceRoot,
            '.vscode/privacy-dictionary.json'
        );

        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.watcher.onDidChange(async () => {
            console.log('[DictionaryManager] Dictionary file changed, reloading...');
            await this.load();
        });

        this.watcher.onDidCreate(async () => {
            console.log('[DictionaryManager] Dictionary file created, reloading...');
            await this.load();
        });

        this.watcher.onDidDelete(() => {
            console.log('[DictionaryManager] Dictionary file deleted, clearing entries');
            this.entries.clear();
            this._onDictionaryChanged.fire();
        });
    }

    /**
     * 停用文件監控
     */
    disableFileWatcher(): void {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
    }

    /**
     * 匯出字典
     */
    async exportDictionary(targetPath: string): Promise<void> {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            entries: this.getAllEntries()
        };

        await fs.writeFile(
            targetPath,
            JSON.stringify(data, null, 2),
            'utf-8'
        );
    }

    /**
     * 匯入字典（合併模式）
     */
    async importDictionary(sourcePath: string, merge: boolean = true): Promise<number> {
        try {
            const content = await fs.readFile(sourcePath, 'utf-8');
            const data = JSON.parse(content);

            if (!Array.isArray(data.entries)) {
                throw new Error('Invalid import format');
            }

            let importedCount = 0;

            for (const entry of data.entries) {
                // 驗證條目
                if (entry.isRegex && !PatternEngine.validateRegex(entry.pattern)) {
                    console.warn(`[DictionaryManager] Skipping invalid regex: ${entry.pattern}`);
                    continue;
                }

                if (!merge || !this.entries.has(entry.id)) {
                    // 生成新 ID 避免衝突
                    const newEntry: DictionaryEntry = {
                        ...entry,
                        id: this.generateId(),
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };

                    this.entries.set(newEntry.id, newEntry);
                    importedCount++;
                }
            }

            if (importedCount > 0) {
                await this.save();
            }

            return importedCount;

        } catch (error) {
            console.error('[DictionaryManager] Import failed:', error);
            throw new Error('Failed to import dictionary');
        }
    }

    /**
     * 取得統計資訊
     */
    getStats() {
        const all = this.getAllEntries();
        const enabled = all.filter(e => e.enabled);
        const regex = all.filter(e => e.isRegex);

        return {
            total: all.length,
            enabled: enabled.length,
            disabled: all.length - enabled.length,
            regexPatterns: regex.length,
            textPatterns: all.length - regex.length
        };
    }

    /**
     * 清除所有條目
     */
    async clear(): Promise<void> {
        this.entries.clear();
        await this.save();
    }

    // ====== Private Helpers ======

    private generateId(): string {
        return `dict_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private generateTokenId(): string {
        return `token_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * 釋放資源
     */
    dispose(): void {
        this.disableFileWatcher();
    }
}
