/**
 * NER Batch Processing Strategy
 * Implements smart batching based on text length
 * Quick Prompt v0.3.0 - Privacy Protection
 */

/**
 * 批次處理策略
 */
export type BatchStrategy = 'pattern-only' | 'pattern-ner-lite' | 'pattern-ner-full';

/**
 * 批次處理決策
 */
export interface BatchDecision {
    strategy: BatchStrategy;
    reason: string;
    estimatedTime: number;  // ms
    useNER: boolean;
    nerScope: 'none' | 'names-only' | 'full';
}

/**
 * 文本長度閾值（字元數）
 */
const LENGTH_THRESHOLDS = {
    SHORT: 200,   // <200: 只用正則
    MEDIUM: 1000  // 200-1000: 正則 + 簡化 NER
    // >1000: 完整 NER 管線
};

/**
 * 估計處理時間（ms）
 */
const ESTIMATED_TIME = {
    PATTERN_ONLY: 10,        // 正則模式
    PATTERN_NER_LITE: 50,    // 簡化 NER（僅人名）
    PATTERN_NER_FULL: 150    // 完整 NER
};

/**
 * 智能批次處理策略決策器
 */
export class BatchProcessor {
    /**
     * 根據文本長度決定處理策略
     * @param text 待處理文本
     * @param forceNER 是否強制使用 NER
     * @returns 批次處理決策
     */
    static decideBatchStrategy(text: string, forceNER: boolean = false): BatchDecision {
        const length = text.length;

        // 強制使用 NER
        if (forceNER) {
            return {
                strategy: 'pattern-ner-full',
                reason: 'User explicitly enabled NER',
                estimatedTime: ESTIMATED_TIME.PATTERN_NER_FULL,
                useNER: true,
                nerScope: 'full'
            };
        }

        // 策略 1: 短文本 (<200 字元) - 只用正則
        if (length < LENGTH_THRESHOLDS.SHORT) {
            return {
                strategy: 'pattern-only',
                reason: `Text is short (${length} chars), pattern matching is sufficient`,
                estimatedTime: ESTIMATED_TIME.PATTERN_ONLY,
                useNER: false,
                nerScope: 'none'
            };
        }

        // 策略 2: 中等文本 (200-1000 字元) - 正則 + 簡化 NER (僅檢測人名)
        if (length < LENGTH_THRESHOLDS.MEDIUM) {
            return {
                strategy: 'pattern-ner-lite',
                reason: `Text is medium (${length} chars), use lite NER for person names`,
                estimatedTime: ESTIMATED_TIME.PATTERN_NER_LITE,
                useNER: true,
                nerScope: 'names-only'
            };
        }

        // 策略 3: 長文本 (>1000 字元) - 完整 NER 管線
        return {
            strategy: 'pattern-ner-full',
            reason: `Text is long (${length} chars), use full NER pipeline`,
            estimatedTime: ESTIMATED_TIME.PATTERN_NER_FULL,
            useNER: true,
            nerScope: 'full'
        };
    }

    /**
     * 檢查是否需要 NER 處理
     * @param text 待檢測文本
     * @returns 是否需要 NER
     */
    static shouldUseNER(text: string): boolean {
        // 快速啟發式檢測：檢查文本中是否可能包含人名、組織等
        // 這些模式表明文本可能包含 PII，值得使用 NER
        
        const heuristics = [
            // 檢查是否有大寫字母開頭的詞（可能是人名/組織）
            /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
            
            // 檢查是否有中文人名模式（姓 + 名）
            /[\u4e00-\u9fa5]{2,3}/,
            
            // 檢查是否有 Mr./Mrs./Dr. 等稱謂
            /\b(Mr|Mrs|Ms|Dr|Prof)\.\s+[A-Z][a-z]+/i,
            
            // 檢查是否有公司、組織關鍵詞
            /\b(Inc|Corp|Ltd|LLC|Company|Organization|Department)\b/i
        ];

        return heuristics.some(pattern => pattern.test(text));
    }

    /**
     * 計算文本複雜度分數（0-1）
     * 用於決定是否需要完整 NER
     */
    static calculateComplexity(text: string): number {
        let score = 0;
        
        // 因素 1: 文本長度
        if (text.length > 500) {
            score += 0.3;
        }
        
        // 因素 2: 大寫字母比例
        const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
        if (uppercaseRatio > 0.1) {
            score += 0.2;
        }
        
        // 因素 3: 數字比例
        const digitRatio = (text.match(/\d/g) || []).length / text.length;
        if (digitRatio > 0.05) {
            score += 0.2;
        }
        
        // 因素 4: 特殊符號比例
        const symbolRatio = (text.match(/[@#$%&*]/g) || []).length / text.length;
        if (symbolRatio > 0.02) {
            score += 0.15;
        }
        
        // 因素 5: 行數
        const lineCount = text.split('\n').length;
        if (lineCount > 20) {
            score += 0.15;
        }
        
        return Math.min(score, 1.0);
    }
}
