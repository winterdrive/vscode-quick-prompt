/**
 * Main Masking Engine
 * Integrates Pattern + NER + Dictionary + SecretStorage
 * Quick Prompt v0.3.0 - Privacy Protection
 */

import * as vscode from 'vscode';
import { MaskingResult, MaskToken, PrivacyConfig } from './types';
import { PatternEngine } from './masking/patternEngine';
import { SecretStorageManager } from './masking/secretStorage';
import { DictionaryManager } from './dictionary/dictionaryManager';
import { NEREngine } from './ner/nerEngine';
import { MaskingCache } from './ner/lruCache';
import { BatchProcessor } from './ner/batchProcessor';

/**
 * 隱私遮罩引擎
 * 整合多種遮罩策略：Pattern + NER + Dictionary
 */
export class MaskingEngine {
    private static instance: MaskingEngine | null = null;

    private patternEngine: PatternEngine;
    private secretStorage: SecretStorageManager;
    private dictionaryManager: DictionaryManager | null = null;
    private nerEngine: NEREngine | null = null;
    private maskingCache: MaskingCache;
    private config: PrivacyConfig;

    private constructor(
        context: vscode.ExtensionContext,
        patternEngine: PatternEngine,
        secretStorage: SecretStorageManager
    ) {
        this.patternEngine = patternEngine;
        this.secretStorage = secretStorage;
        this.config = this.loadConfig();
        this.maskingCache = new MaskingCache(this.config.cache.maxSize);
        
        // 初始化 Dictionary Manager
        this.initializeDictionary().catch(err => {
            console.error('[MaskingEngine] Failed to initialize dictionary:', err);
        });
        
        // 初始化 NER Engine（延遲載入）
        this.initializeNER();
        
        // 監聽設定變更
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('quickPrompt.privacy')) {
                this.config = this.loadConfig();
            }
        });
    }

    /**
     * 取得單例實例
     */
    public static getInstance(context?: vscode.ExtensionContext): MaskingEngine {
        if (!MaskingEngine.instance && context) {
            const patternEngine = new PatternEngine();
            const secretStorage = new SecretStorageManager(context.secrets);
            MaskingEngine.instance = new MaskingEngine(context, patternEngine, secretStorage);
        }

        if (!MaskingEngine.instance) {
            throw new Error('MaskingEngine not initialized. Call getInstance with context first.');
        }

        return MaskingEngine.instance;
    }

    /**
     * 初始化 Dictionary Manager
     */
    private async initializeDictionary(): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                console.warn('[MaskingEngine] No workspace folder, dictionary disabled');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            this.dictionaryManager = new DictionaryManager(workspaceRoot);
            
            // 載入字典
            await this.dictionaryManager.load();
            
            // 啟用文件監控
            this.dictionaryManager.enableFileWatcher();
            
            console.log('[MaskingEngine] Dictionary initialized');

        } catch (error) {
            console.error('[MaskingEngine] Dictionary initialization failed:', error);
        }
    }

    /**
     * 取得 Dictionary Manager
     */
    public getDictionaryManager(): DictionaryManager | null {
        return this.dictionaryManager;
    }

    /**
     * 初始化 NER Engine
     */
    private initializeNER(): void {
        try {
            this.nerEngine = new NEREngine(this.config.ner);
            console.log('[MaskingEngine] NER Engine created (lazy loading)');
        } catch (error) {
            console.error('[MaskingEngine] NER Engine initialization failed:', error);
        }
    }

    /**
     * 取得 NER Engine
     */
    public getNEREngine(): NEREngine | null {
        return this.nerEngine;
    }

    /**
     * 載入設定
     */
    private loadConfig(): PrivacyConfig {
        const config = vscode.workspace.getConfiguration('quickPrompt.privacy');
        return {
            enabled: config.get('enabled', true),
            autoMask: config.get('autoMask', true),
            patterns: {
                email: config.get('patterns.email', true),
                phone: config.get('patterns.phone', true),
                apiKeys: config.get('patterns.apiKeys', true),
                creditCard: config.get('patterns.creditCard', true),
                ipAddress: config.get('patterns.ipAddress', true),
                privateKey: config.get('patterns.privateKey', true)
            },
            ner: {
                modelSize: config.get('ner.modelSize', 'medium'),
                quantized: config.get('ner.quantized', true),
                languages: config.get('ner.languages', ['en', 'zh']),
                confidenceThreshold: config.get('ner.confidenceThreshold', 0.85),
                useWorker: config.get('ner.useWorker', true)
            },
            dictionaryPath: config.get('dictionaryPath', '.vscode/privacy-dictionary.json'),
            ui: {
                showNotification: config.get('ui.showNotification', true),
                maskLabel: config.get('ui.maskLabel', '[MASKED]'),
                highlightColor: config.get('ui.highlightColor', '#ff6b6b')
            },
            cache: {
                enabled: config.get('cache.enabled', true),
                maxSize: config.get('cache.maxSize', 100),
                ttl: config.get('cache.ttl', 300000)
            }
        };
    }

    /**
     * 遮罩文字（整合所有策略）
     * @param text 原始文字
     * @param options 遮罩選項
     */
    public async maskText(
        text: string,
        options?: {
            enablePatterns?: boolean;
            enableNER?: boolean;
            enableDictionary?: boolean;
            storeSecurely?: boolean;
        }
    ): Promise<MaskingResult> {
        const startTime = Date.now();
        const strategies: string[] = [];
        let maskedText = text;
        let allTokens: MaskToken[] = [];

        // 如果未啟用隱私保護，直接返回
        if (!this.config.enabled) {
            return {
                maskedText: text,
                originalText: text,
                tokens: [],
                processingTime: 0,
                strategies: []
            };
        }

        try {
            // 檢查快取
            if (this.config.cache.enabled) {
                const cachedResult = this.maskingCache.getMaskingResult(text, options);
                if (cachedResult) {
                    console.log('[MaskingEngine] Cache hit');
                    return cachedResult;
                }
            }

            // 決定批次處理策略
            const batchDecision = BatchProcessor.decideBatchStrategy(
                text, 
                options?.enableNER === true
            );
            
            console.log('[MaskingEngine] Batch strategy:', batchDecision);

            // 1. Custom Dictionary (最高優先級)
            if (options?.enableDictionary !== false && this.dictionaryManager) {
                const dictionaryResult = this.dictionaryManager.mask(maskedText);
                maskedText = dictionaryResult.maskedText;
                allTokens = allTokens.concat(dictionaryResult.tokens);
                
                if (dictionaryResult.tokens.length > 0) {
                    strategies.push('dictionary');
                }
            }

            // 2. Pattern Masking (次高優先級)
            if (options?.enablePatterns !== false) {
                const patternResult = this.patternEngine.mask(maskedText);
                maskedText = patternResult.maskedText;
                allTokens = allTokens.concat(patternResult.tokens);
                
                if (patternResult.tokens.length > 0) {
                    strategies.push('pattern');
                }
            }

            // 3. NER Masking (最低優先級，最耗時)
            if (batchDecision.useNER && options?.enableNER !== false && this.nerEngine) {
                try {
                    // 根據策略決定 NER 範圍
                    const nerResult = await this.nerEngine.mask(maskedText);
                    maskedText = nerResult.maskedText;
                    
                    // 根據 nerScope 過濾結果
                    let filteredTokens = nerResult.tokens;
                    if (batchDecision.nerScope === 'names-only') {
                        // 只保留人名實體
                        filteredTokens = nerResult.tokens.filter(
                            token => token.type === 'PERSON' as any
                        );
                    }
                    
                    allTokens = allTokens.concat(filteredTokens);
                    
                    if (filteredTokens.length > 0) {
                        strategies.push('ner');
                    }
                } catch (error) {
                    console.error('[MaskingEngine] NER failed:', error);
                    strategies.push('ner-error');
                }
            }

            // 4. 安全儲存遮罩映射
            if (options?.storeSecurely !== false && allTokens.length > 0) {
                await this.secretStorage.storeBatch(allTokens);
            }

            const processingTime = Date.now() - startTime;

            const result: MaskingResult = {
                maskedText,
                originalText: text,
                tokens: allTokens,
                processingTime,
                strategies
            };

            // 5. 快取結果
            if (this.config.cache.enabled) {
                this.maskingCache.setMaskingResult(text, result, options);
            }

            // 6. 顯示通知（如果有遮罩項目）
            if (allTokens.length > 0 && this.config.ui.showNotification) {
                this.showMaskingNotification(allTokens.length);
            }

            return result;

        } catch (error) {
            console.error('[MaskingEngine] Error during masking:', error);
            
            // 錯誤處理：返回原始文字（安全優先）
            return {
                maskedText: text,
                originalText: text,
                tokens: [],
                processingTime: Date.now() - startTime,
                strategies: ['error']
            };
        }
    }

    /**
     * 解除遮罩（需要使用者確認）
     * @param maskedText 遮罩後的文字
     */
    public async unmaskText(maskedText: string): Promise<string | undefined> {
        // 檢查工作區信任狀態
        if (!vscode.workspace.isTrusted) {
            vscode.window.showErrorMessage(
                'Cannot unmask in untrusted workspace for security reasons'
            );
            return undefined;
        }

        // 要求使用者確認
        const confirmed = await vscode.window.showWarningMessage(
            '🔓 This action will reveal sensitive information. Are you sure?',
            { modal: true },
            'I Understand'
        );

        if (confirmed !== 'I Understand') {
            return undefined;
        }

        try {
            // 提取所有 Token ID
            const tokenIds = this.extractTokenIds(maskedText);
            
            if (tokenIds.length === 0) {
                return maskedText;
            }

            // 批次取回原始值
            const mapping = await this.secretStorage.retrieveBatch(tokenIds);
            
            // 替換回原始值
            let unmaskedText = maskedText;
            for (const [tokenId, originalValue] of mapping.entries()) {
                // 找到 token 的顯示格式 (例如: [EMAIL-1])
                const tokenRegex = new RegExp(`\\[\\w+-\\d+\\]`, 'g');
                unmaskedText = unmaskedText.replace(tokenRegex, originalValue);
            }

            return unmaskedText;

        } catch (error) {
            console.error('[MaskingEngine] Error during unmasking:', error);
            vscode.window.showErrorMessage('Failed to unmask text');
            return undefined;
        }
    }

    /**
     * 清除所有遮罩映射
     */
    public async clearAllMappings(): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            'This will clear all stored mask mappings. Continue?',
            { modal: true },
            'Clear'
        );

        if (confirmed === 'Clear') {
            await this.secretStorage.clear();
            vscode.window.showInformationMessage('All mask mappings cleared');
        }
    }

    /**
     * 取得遮罩統計
     */
    public async getStats() {
        const storageStats = await this.secretStorage.getStats();
        const cacheStats = this.maskingCache.getStats();
        const nerInfo = this.nerEngine?.getModelInfo();
        
        return {
            enabled: this.config.enabled,
            totalMasks: storageStats.count,
            oldestMask: new Date(storageStats.oldestTimestamp),
            newestMask: new Date(storageStats.newestTimestamp),
            enabledPatterns: this.patternEngine.getPatterns().filter(p => p.enabled).length,
            totalPatterns: this.patternEngine.getPatterns().length,
            cache: {
                size: cacheStats.size,
                hitRate: cacheStats.hitRate,
                avgProcessingTime: cacheStats.avgProcessingTime
            },
            ner: nerInfo ? {
                model: nerInfo.name,
                state: nerInfo.state
            } : null
        };
    }

    /**
     * 清理過期的遮罩映射
     */
    public async cleanupExpired(): Promise<void> {
        await this.secretStorage.cleanupExpired();
    }

    /**
     * 清除快取
     */
    public clearCache(): void {
        this.maskingCache.clear();
        console.log('[MaskingEngine] Cache cleared');
    }

    /**
     * 更新設定
     */
    public updateConfig(config: Partial<PrivacyConfig>): void {
        this.config = { ...this.config, ...config };
    }

    // ====== Private Methods ======

    /**
     * 顯示遮罩通知
     */
    private showMaskingNotification(count: number): void {
        const message = `🔒 Masked ${count} sensitive item${count > 1 ? 's' : ''}`;
        
        vscode.window.showInformationMessage(
            message,
            'View Details',
            'Settings'
        ).then(selection => {
            if (selection === 'View Details') {
                vscode.commands.executeCommand('quickPrompt.showMaskingReport');
            } else if (selection === 'Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'quickPrompt.privacy');
            }
        });
    }

    /**
     * 從文字中提取 Token IDs
     */
    private extractTokenIds(text: string): string[] {
        // 這裡簡化處理，實際應該從 maskedText 中解析出對應的 token IDs
        // 目前返回空陣列，待完整實作
        return [];
    }
}
