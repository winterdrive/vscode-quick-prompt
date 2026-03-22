/**
 * LRU Cache Implementation
 * In-memory cache with Least Recently Used eviction policy
 * Quick Prompt v0.3.0 - Privacy Protection
 */

import type { LRUCache as ILRUCache, MaskingResult } from '../types';

/**
 * LRU Cache 節點
 */
class CacheNode<K, V> {
    key: K;
    value: V;
    timestamp: number;
    processingTime: number;
    prev: CacheNode<K, V> | null = null;
    next: CacheNode<K, V> | null = null;

    constructor(key: K, value: V, processingTime: number = 0) {
        this.key = key;
        this.value = value;
        this.timestamp = Date.now();
        this.processingTime = processingTime;
    }
}

/**
 * LRU Cache 統計資訊
 */
interface CacheStats {
    hits: number;
    misses: number;
    totalProcessingTime: number;
    evictions: number;
}

/**
 * LRU (Least Recently Used) Cache
 * 用於快取 NER 遮罩結果
 */
export class LRUCache<K, V> implements ILRUCache<K, V> {
    private capacity: number;
    private cache: Map<K, CacheNode<K, V>>;
    private head: CacheNode<K, V> | null = null;  // 最近使用
    private tail: CacheNode<K, V> | null = null;  // 最久未使用
    private stats: CacheStats;

    constructor(capacity: number = 100) {
        this.capacity = capacity;
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            totalProcessingTime: 0,
            evictions: 0
        };
    }

    /**
     * 取得快取值
     */
    get(key: K): V | undefined {
        const node = this.cache.get(key);
        
        if (!node) {
            this.stats.misses++;
            return undefined;
        }

        // 移到最前面（最近使用）
        this.moveToHead(node);
        this.stats.hits++;
        
        return node.value;
    }

    /**
     * 設定快取值
     */
    set(key: K, value: V, processingTime: number = 0): void {
        const existingNode = this.cache.get(key);

        if (existingNode) {
            // 更新現有節點
            existingNode.value = value;
            existingNode.timestamp = Date.now();
            existingNode.processingTime = processingTime;
            this.moveToHead(existingNode);
        } else {
            // 新增節點
            const newNode = new CacheNode(key, value, processingTime);
            this.cache.set(key, newNode);
            this.addToHead(newNode);
            this.stats.totalProcessingTime += processingTime;

            // 超過容量，移除最久未使用的
            if (this.cache.size > this.capacity) {
                const removed = this.removeTail();
                if (removed) {
                    this.cache.delete(removed.key);
                    this.stats.evictions++;
                }
            }
        }
    }

    /**
     * 檢查是否存在
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * 刪除快取項目
     */
    delete(key: K): boolean {
        const node = this.cache.get(key);
        if (!node) {
            return false;
        }

        this.removeNode(node);
        return this.cache.delete(key);
    }

    /**
     * 清空快取
     */
    clear(): void {
        this.cache.clear();
        this.head = null;
        this.tail = null;
        this.stats = {
            hits: 0,
            misses: 0,
            totalProcessingTime: 0,
            evictions: 0
        };
    }

    /**
     * 取得快取大小
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * 取得命中率
     */
    get hitRate(): number {
        const total = this.stats.hits + this.stats.misses;
        return total === 0 ? 0 : this.stats.hits / total;
    }

    /**
     * 取得平均處理時間
     */
    get avgProcessingTime(): number {
        return this.cache.size === 0 
            ? 0 
            : this.stats.totalProcessingTime / this.cache.size;
    }

    /**
     * 取得統計資訊
     */
    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            capacity: this.capacity,
            hitRate: this.hitRate,
            avgProcessingTime: this.avgProcessingTime
        };
    }

    // ====== Private Methods ======

    /**
     * 將節點移到最前面
     */
    private moveToHead(node: CacheNode<K, V>): void {
        this.removeNode(node);
        this.addToHead(node);
    }

    /**
     * 在最前面新增節點
     */
    private addToHead(node: CacheNode<K, V>): void {
        node.prev = null;
        node.next = this.head;

        if (this.head) {
            this.head.prev = node;
        }

        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }
    }

    /**
     * 移除節點
     */
    private removeNode(node: CacheNode<K, V>): void {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    /**
     * 移除尾部節點（最久未使用）
     */
    private removeTail(): CacheNode<K, V> | null {
        const removed = this.tail;
        if (removed) {
            this.removeNode(removed);
        }
        return removed;
    }
}

/**
 * 專門用於遮罩結果的快取
 */
export class MaskingCache extends LRUCache<string, MaskingResult> {
    /**
     * 生成快取鍵
     * 使用文本內容的 hash
     */
    static generateKey(text: string, options?: any): string {
        // 簡單的 hash 函數
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        const optionsStr = options ? JSON.stringify(options) : '';
        return `${hash}_${optionsStr}`;
    }

    /**
     * 取得快取的遮罩結果
     */
    getMaskingResult(text: string, options?: any): MaskingResult | undefined {
        const key = MaskingCache.generateKey(text, options);
        return this.get(key);
    }

    /**
     * 快取遮罩結果
     */
    setMaskingResult(text: string, result: MaskingResult, options?: any): void {
        const key = MaskingCache.generateKey(text, options);
        this.set(key, result, result.processingTime);
    }
}
