/**
 * Named Entity Recognition Engine
 * Uses @xenova/transformers (Transformers.js) with GLiNER-PII model
 * Quick Prompt v0.3.0 - Privacy Protection
 */

import { pipeline, AutoTokenizer, AutoModelForTokenClassification } from '@xenova/transformers';
import type { MaskingResult, MaskToken, Entity, NERConfig } from '../types';

/**
 * NER 實體類型映射到遮罩標籤
 */
const ENTITY_TYPE_LABELS: Record<string, string> = {
    'PER': '[PERSON]',        // 人名
    'ORG': '[ORGANIZATION]',  // 組織
    'LOC': '[LOCATION]',      // 地點
    'EMAIL': '[EMAIL]',       // Email (GLiNER 專屬)
    'PHONE': '[PHONE]',       // 電話 (GLiNER 專屬)
    'SSN': '[SSN]',           // 社會安全號碼
    'CREDIT_CARD': '[CREDIT_CARD]',  // 信用卡號
    'IP_ADDRESS': '[IP_ADDRESS]',    // IP 位址
    'DATE': '[DATE]',         // 日期
    'MONEY': '[MONEY]',       // 金額
    'PERCENT': '[PERCENT]'    // 百分比
};

/**
 * 支援的 NER 模型配置
 */
const NER_MODELS = {
    'gliner-pii': {
        name: 'nvidia/gliner-PII',
        size: 340,  // MB
        languages: ['en'],
        entities: ['PER', 'ORG', 'LOC', 'EMAIL', 'PHONE', 'SSN', 'CREDIT_CARD', 'IP_ADDRESS']
    },
    'dslim-ner': {
        name: 'dslim/bert-base-NER',
        size: 110,  // MB
        languages: ['en'],
        entities: ['PER', 'ORG', 'LOC', 'MISC']
    },
    'multilingual': {
        name: 'microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank',
        size: 200,  // MB
        languages: ['en', 'zh', 'ja', 'ko', 'multi'],
        entities: ['PER', 'ORG', 'LOC', 'DATE', 'MONEY', 'PERCENT']
    }
};

/**
 * NER Engine 狀態
 */
type NEREngineState = 'uninitialized' | 'loading' | 'ready' | 'error';

/**
 * Named Entity Recognition Engine
 * 使用 Transformers.js 進行實體識別
 */
export class NEREngine {
    private pipeline: any = null;
    private state: NEREngineState = 'uninitialized';
    private config: NERConfig;
    private modelName: string;
    private loadingPromise: Promise<void> | null = null;

    constructor(config: NERConfig) {
        this.config = config;
        this.modelName = this.selectModel(config);
    }

    /**
     * 根據設定選擇最適合的模型
     */
    private selectModel(config: NERConfig): string {
        // 如果只需要英文，使用 GLiNER-PII (最佳 PII 檢測)
        if (config.languages.length === 1 && config.languages[0] === 'en') {
            return config.modelSize === 'small' 
                ? NER_MODELS['dslim-ner'].name 
                : NER_MODELS['gliner-pii'].name;
        }

        // 多語言需求
        if (config.languages.includes('multi') || config.languages.length > 1) {
            return NER_MODELS['multilingual'].name;
        }

        // 預設使用 GLiNER-PII
        return NER_MODELS['gliner-pii'].name;
    }

    /**
     * 初始化 NER Pipeline
     */
    async initialize(): Promise<void> {
        if (this.state === 'ready') {
            return;
        }

        if (this.state === 'loading' && this.loadingPromise) {
            return this.loadingPromise;
        }

        this.state = 'loading';
        
        this.loadingPromise = (async () => {
            try {
                console.log(`[NEREngine] Loading model: ${this.modelName}`);
                console.log(`[NEREngine] Config:`, {
                    quantized: this.config.quantized,
                    useWorker: this.config.useWorker
                });

                // 創建 token-classification pipeline
                this.pipeline = await pipeline(
                    'token-classification',
                    this.modelName,
                    {
                        quantized: this.config.quantized,
                        // progress_callback 可以用來顯示下載進度
                        progress_callback: (progress: any) => {
                            if (progress.status === 'progress') {
                                console.log(`[NEREngine] Download progress: ${progress.progress}%`);
                            }
                        }
                    }
                );

                this.state = 'ready';
                console.log(`[NEREngine] Model loaded successfully`);

            } catch (error) {
                this.state = 'error';
                console.error('[NEREngine] Failed to load model:', error);
                throw error;
            }
        })();

        return this.loadingPromise;
    }

    /**
     * 檢測文本中的實體
     * @param text 待檢測文本
     * @returns 識別到的實體列表
     */
    async detectEntities(text: string): Promise<Entity[]> {
        if (this.state !== 'ready') {
            await this.initialize();
        }

        if (!this.pipeline) {
            throw new Error('[NEREngine] Pipeline not initialized');
        }

        try {
            const startTime = Date.now();

            // 執行 NER 推論
            const results = await this.pipeline(text, {
                aggregation_strategy: 'simple'  // 合併連續的相同實體
            });

            const entities: Entity[] = results
                .filter((result: any) => result.score >= this.config.confidenceThreshold)
                .map((result: any) => ({
                    text: result.word,
                    type: result.entity_group || result.entity,
                    start: result.start,
                    end: result.end,
                    confidence: result.score
                }));

            const processingTime = Date.now() - startTime;
            console.log(`[NEREngine] Detected ${entities.length} entities in ${processingTime}ms`);

            return entities;

        } catch (error) {
            console.error('[NEREngine] Entity detection failed:', error);
            return [];
        }
    }

    /**
     * 使用 NER 遮罩文本
     * @param text 原始文本
     * @returns 遮罩結果
     */
    async mask(text: string): Promise<MaskingResult> {
        const startTime = Date.now();

        try {
            // 檢測實體
            const entities = await this.detectEntities(text);

            if (entities.length === 0) {
                return {
                    maskedText: text,
                    originalText: text,
                    tokens: [],
                    processingTime: Date.now() - startTime,
                    strategies: []
                };
            }

            // 按位置排序（從後往前遮罩，避免位置偏移）
            const sortedEntities = [...entities].sort((a, b) => b.start - a.start);

            let maskedText = text;
            const tokens: MaskToken[] = [];

            for (const entity of sortedEntities) {
                const maskLabel = ENTITY_TYPE_LABELS[entity.type] || `[${entity.type}]`;
                const tokenId = `ner-${entity.type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // 將實體類型轉換為 MaskType
                let maskType: any = 'MISC';
                if (entity.type === 'PER' || entity.type === 'PERSON') {
                    maskType = 'PERSON';
                } else if (entity.type === 'ORG' || entity.type === 'ORGANIZATION') {
                    maskType = 'ORGANIZATION';
                } else if (entity.type === 'LOC' || entity.type === 'LOCATION') {
                    maskType = 'LOCATION';
                } else if (entity.type === 'EMAIL') {
                    maskType = 'EMAIL';
                } else if (entity.type === 'PHONE') {
                    maskType = 'PHONE';
                } else if (entity.type === 'SSN') {
                    maskType = 'SSN';
                } else if (entity.type === 'CREDIT_CARD') {
                    maskType = 'CREDIT_CARD';
                } else if (entity.type === 'IP_ADDRESS') {
                    maskType = 'IP_ADDRESS';
                }

                // 替換實體為遮罩標籤
                maskedText = 
                    maskedText.substring(0, entity.start) +
                    maskLabel +
                    maskedText.substring(entity.end);

                tokens.push({
                    id: tokenId,
                    originalValue: entity.text,
                    maskedValue: maskLabel,
                    type: maskType,
                    createdAt: Date.now(),
                    reversible: true,
                    startPos: entity.start,
                    endPos: entity.end,
                    confidence: entity.confidence
                });
            }

            const processingTime = Date.now() - startTime;

            return {
                maskedText,
                originalText: text,
                tokens,
                processingTime,
                strategies: ['ner']
            };

        } catch (error) {
            console.error('[NEREngine] Masking failed:', error);
            
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
     * 取得引擎狀態
     */
    getState(): NEREngineState {
        return this.state;
    }

    /**
     * 取得模型資訊
     */
    getModelInfo() {
        return {
            name: this.modelName,
            state: this.state,
            config: this.config
        };
    }

    /**
     * 釋放資源
     */
    async dispose(): Promise<void> {
        if (this.pipeline) {
            // Transformers.js 的 pipeline 會自動管理資源
            this.pipeline = null;
        }
        this.state = 'uninitialized';
        this.loadingPromise = null;
        console.log('[NEREngine] Disposed');
    }
}
