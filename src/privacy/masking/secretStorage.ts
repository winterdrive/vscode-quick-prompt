/**
 * Secret Storage Manager
 * Uses VS Code SecretStorage API for OS-level encrypted storage
 * Quick Prompt v0.3.0 - Privacy Protection
 */

import * as vscode from 'vscode';
import { MaskToken } from '../types';

/**
 * SecretStorage 管理器
 * 使用 VS Code 的 SecretStorage API 進行 OS-level 加密儲存
 */
export class SecretStorageManager {
    private static readonly STORAGE_KEY_PREFIX = 'quickPrompt.privacy.token';
    private static readonly MAPPING_KEY = 'quickPrompt.privacy.mapping';
    private static readonly MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

    constructor(private secretStorage: vscode.SecretStorage) {}

    /**
     * 儲存遮罩映射（加密）
     * @param tokenId Token ID
     * @param originalValue 原始值（將被加密）
     */
    async storeMaskMapping(tokenId: string, originalValue: string): Promise<void> {
        try {
            const key = this.getStorageKey(tokenId);
            const value = JSON.stringify({
                original: originalValue,
                timestamp: Date.now()
            });

            await this.secretStorage.store(key, value);
        } catch (error) {
            console.error('[SecretStorage] Failed to store mask mapping:', error);
            throw new Error('Failed to store sensitive data securely');
        }
    }

    /**
     * 批次儲存多個遮罩映射
     * @param tokens 遮罩 Token 陣列
     */
    async storeBatch(tokens: MaskToken[]): Promise<void> {
        const promises = tokens.map(token =>
            this.storeMaskMapping(token.id, token.originalValue)
        );

        try {
            await Promise.all(promises);
            
            // 更新映射索引
            await this.updateMappingIndex(tokens);
        } catch (error) {
            console.error('[SecretStorage] Failed to store batch:', error);
            throw new Error('Failed to store multiple sensitive items');
        }
    }

    /**
     * 取回原始值（解密）
     * @param tokenId Token ID
     * @returns 原始值，若不存在或過期則返回 undefined
     */
    async retrieveOriginal(tokenId: string): Promise<string | undefined> {
        try {
            const key = this.getStorageKey(tokenId);
            const stored = await this.secretStorage.get(key);

            if (!stored) {
                return undefined;
            }

            const data = JSON.parse(stored);
            
            // 檢查是否過期
            if (Date.now() - data.timestamp > SecretStorageManager.MAX_AGE) {
                await this.delete(tokenId);
                return undefined;
            }

            return data.original;
        } catch (error) {
            console.error('[SecretStorage] Failed to retrieve original value:', error);
            return undefined;
        }
    }

    /**
     * 批次取回原始值
     * @param tokenIds Token ID 陣列
     * @returns Map<tokenId, originalValue>
     */
    async retrieveBatch(tokenIds: string[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        
        const promises = tokenIds.map(async (tokenId) => {
            const value = await this.retrieveOriginal(tokenId);
            if (value) {
                results.set(tokenId, value);
            }
        });

        await Promise.all(promises);
        return results;
    }

    /**
     * 刪除指定的遮罩映射
     * @param tokenId Token ID
     */
    async delete(tokenId: string): Promise<void> {
        try {
            const key = this.getStorageKey(tokenId);
            await this.secretStorage.delete(key);
            
            // 從映射索引中移除
            await this.removeFromMappingIndex(tokenId);
        } catch (error) {
            console.error('[SecretStorage] Failed to delete mapping:', error);
        }
    }

    /**
     * 清理過期的映射
     * @param maxAge 最大保留時間（毫秒），預設 7 天
     */
    async cleanupExpired(maxAge: number = SecretStorageManager.MAX_AGE): Promise<void> {
        try {
            const mapping = await this.getMappingIndex();
            const now = Date.now();
            const expiredTokens: string[] = [];

            for (const [tokenId, timestamp] of mapping.entries()) {
                if (now - timestamp > maxAge) {
                    expiredTokens.push(tokenId);
                }
            }

            // 刪除過期項目
            await Promise.all(expiredTokens.map(tokenId => this.delete(tokenId)));

            console.log(`[SecretStorage] Cleaned up ${expiredTokens.length} expired tokens`);
        } catch (error) {
            console.error('[SecretStorage] Failed to cleanup expired mappings:', error);
        }
    }

    /**
     * 清除所有遮罩映射
     */
    async clear(): Promise<void> {
        try {
            const mapping = await this.getMappingIndex();
            
            // 刪除所有 token
            await Promise.all(
                Array.from(mapping.keys()).map(tokenId => this.delete(tokenId))
            );

            // 清除映射索引
            await this.secretStorage.delete(SecretStorageManager.MAPPING_KEY);

            console.log('[SecretStorage] Cleared all mask mappings');
        } catch (error) {
            console.error('[SecretStorage] Failed to clear mappings:', error);
            throw new Error('Failed to clear sensitive data');
        }
    }

    /**
     * 取得所有 Token ID
     */
    async getAllTokenIds(): Promise<string[]> {
        try {
            const mapping = await this.getMappingIndex();
            return Array.from(mapping.keys());
        } catch (error) {
            console.error('[SecretStorage] Failed to get token IDs:', error);
            return [];
        }
    }

    /**
     * 檢查 Token 是否存在
     * @param tokenId Token ID
     */
    async has(tokenId: string): Promise<boolean> {
        const key = this.getStorageKey(tokenId);
        const value = await this.secretStorage.get(key);
        return value !== undefined;
    }

    /**
     * 取得儲存統計
     */
    async getStats(): Promise<{ count: number; oldestTimestamp: number; newestTimestamp: number }> {
        try {
            const mapping = await this.getMappingIndex();
            const timestamps = Array.from(mapping.values());

            return {
                count: mapping.size,
                oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : 0,
                newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : 0
            };
        } catch (error) {
            return { count: 0, oldestTimestamp: 0, newestTimestamp: 0 };
        }
    }

    // ====== Private Methods ======

    /**
     * 生成儲存 Key
     */
    private getStorageKey(tokenId: string): string {
        return `${SecretStorageManager.STORAGE_KEY_PREFIX}.${tokenId}`;
    }

    /**
     * 取得映射索引
     * @returns Map<tokenId, timestamp>
     */
    private async getMappingIndex(): Promise<Map<string, number>> {
        try {
            const stored = await this.secretStorage.get(SecretStorageManager.MAPPING_KEY);
            if (!stored) {
                return new Map();
            }

            const data = JSON.parse(stored);
            return new Map(Object.entries(data).map(([k, v]) => [k, v as number]));
        } catch (error) {
            console.error('[SecretStorage] Failed to get mapping index:', error);
            return new Map();
        }
    }

    /**
     * 更新映射索引
     */
    private async updateMappingIndex(tokens: MaskToken[]): Promise<void> {
        try {
            const mapping = await this.getMappingIndex();

            tokens.forEach(token => {
                mapping.set(token.id, token.createdAt);
            });

            const data = Object.fromEntries(mapping);
            await this.secretStorage.store(
                SecretStorageManager.MAPPING_KEY,
                JSON.stringify(data)
            );
        } catch (error) {
            console.error('[SecretStorage] Failed to update mapping index:', error);
        }
    }

    /**
     * 從映射索引中移除
     */
    private async removeFromMappingIndex(tokenId: string): Promise<void> {
        try {
            const mapping = await this.getMappingIndex();
            mapping.delete(tokenId);

            const data = Object.fromEntries(mapping);
            await this.secretStorage.store(
                SecretStorageManager.MAPPING_KEY,
                JSON.stringify(data)
            );
        } catch (error) {
            console.error('[SecretStorage] Failed to remove from mapping index:', error);
        }
    }
}

/**
 * 輔助函數：建立 SecretStorageManager 實例
 */
export function createSecretStorageManager(context: vscode.ExtensionContext): SecretStorageManager {
    return new SecretStorageManager(context.secrets);
}
