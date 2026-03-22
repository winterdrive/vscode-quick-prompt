/**
 * Privacy Protection Module - Type Definitions
 * Quick Prompt v0.3.0
 */

/**
 * 隱私遮罩類型
 */
export enum MaskType {
    // 個人識別資訊 (PII)
    EMAIL = 'EMAIL',
    PHONE = 'PHONE',
    SSN = 'SSN',
    ID_CARD = 'ID_CARD',
    
    // API 認證資訊
    API_KEY = 'API_KEY',
    AWS_KEY = 'AWS_KEY',
    GITHUB_TOKEN = 'GITHUB_TOKEN',
    OPENAI_KEY = 'OPENAI_KEY',
    JWT_TOKEN = 'JWT_TOKEN',
    
    // 金融資訊
    CREDIT_CARD = 'CREDIT_CARD',
    BANK_ACCOUNT = 'BANK_ACCOUNT',
    
    // 網路資訊
    IP_ADDRESS = 'IP_ADDRESS',
    IPV6_ADDRESS = 'IPV6_ADDRESS',
    PRIVATE_KEY = 'PRIVATE_KEY',
    
    // NER 實體類型
    PERSON = 'PERSON',
    ORGANIZATION = 'ORGANIZATION',
    LOCATION = 'LOCATION',
    DATE = 'DATE',
    MONEY = 'MONEY',
    
    // 自訂
    CUSTOM = 'CUSTOM',
    MISC = 'MISC'
}

/**
 * 命名實體識別結果
 */
export interface Entity {
    /** 實體文字 */
    text: string;
    /** 實體類型 (e.g., 'PER', 'ORG', 'LOC', 'EMAIL', etc.) */
    type: string;
    /** 信心分數 (0-1) */
    confidence: number;
    /** 起始位置 */
    start: number;
    /** 結束位置 */
    end: number;
    /** 使用的模型名稱 (optional) */
    model?: string;
}

/**
 * 遮罩 Token
 */
export interface MaskToken {
    /** Token ID (唯一識別符) */
    id: string;
    /** 原始值 (加密儲存) */
    originalValue: string;
    /** 遮罩後的顯示文字 */
    maskedValue: string;
    /** 遮罩類型 */
    type: MaskType;
    /** 建立時間 */
    createdAt: number;
    /** 是否可解除遮罩 */
    reversible: boolean;
    /** 起始位置 (optional, 用於 NER) */
    startPos?: number;
    /** 結束位置 (optional, 用於 NER) */
    endPos?: number;
    /** 信心分數 (optional, 用於 NER) */
    confidence?: number;
}

/**
 * 遮罩結果
 */
export interface MaskingResult {
    /** 遮罩後的文字 */
    maskedText: string;
    /** 原始文字 */
    originalText: string;
    /** 遮罩的 Token 列表 */
    tokens: MaskToken[];
    /** 處理時間 (ms) */
    processingTime: number;
    /** 使用的策略 (pattern/ner/dictionary) */
    strategies: string[];
}

/**
 * 隱私字典條目
 */
export interface DictionaryEntry {
    /** 條目 ID */
    id: string;
    /** 要遮罩的文字或正則表達式 */
    pattern: string;
    /** 是否為正則表達式 */
    isRegex: boolean;
    /** 遮罩標籤 */
    label: string;
    /** 是否啟用 */
    enabled: boolean;
    /** 建立時間 */
    createdAt: number;
    /** 更新時間 */
    updatedAt: number;
    /** 備註 */
    note?: string;
}

/**
 * 隱私審計日誌
 */
export interface AuditLog {
    /** 日誌 ID */
    id: string;
    /** 時間戳記 */
    timestamp: number;
    /** 操作類型 */
    action: 'mask' | 'unmask' | 'export' | 'clear' | 'config_change';
    /** 遮罩類型 */
    maskTypes: MaskType[];
    /** 項目數量 */
    itemCount: number;
    /** 使用者操作 (optional) */
    userAction?: string;
    /** 額外元資料 */
    metadata?: Record<string, any>;
}

/**
 * 正則表達式模式定義
 */
export interface PatternDefinition {
    /** 模式名稱 */
    name: string;
    /** 正則表達式 */
    regex: RegExp;
    /** 遮罩類型 */
    type: MaskType;
    /** 遮罩標籤格式 */
    label: string;
    /** 是否預設啟用 */
    enabled: boolean;
    /** 優先級 (數字越小優先級越高) */
    priority: number;
}

/**
 * NER 設定
 */
export interface NERConfig {
    /** 模型大小 */
    modelSize: 'small' | 'medium' | 'large';
    /** 是否使用量化模型 */
    quantized: boolean;
    /** 支援的語言 */
    languages: ('en' | 'zh' | 'ja' | 'ko' | 'multi')[];
    /** 信心分數門檻 */
    confidenceThreshold: number;
    /** 是否使用 WebWorker */
    useWorker: boolean;
}

/**
 * 隱私保護設定
 */
export interface PrivacyConfig {
    /** 是否啟用隱私保護 */
    enabled: boolean;
    /** 是否自動遮罩 */
    autoMask: boolean;
    
    /** Pattern Masking 設定 */
    patterns: {
        email: boolean;
        phone: boolean;
        apiKeys: boolean;
        creditCard: boolean;
        ipAddress: boolean;
        privateKey: boolean;
    };
    
    /** NER 設定 */
    ner: NERConfig;
    
    /** 自訂字典路徑 */
    dictionaryPath: string;
    
    /** UI 設定 */
    ui: {
        showNotification: boolean;
        maskLabel: string;
        highlightColor: string;
    };
    
    /** 快取設定 */
    cache: {
        enabled: boolean;
        maxSize: number;
        ttl: number;
    };
}

/**
 * LRU 快取介面
 */
export interface LRUCache<K, V> {
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    size: number;
    hitRate: number;
    avgProcessingTime: number;
}

/**
 * IndexedDB 快取介面
 */
export interface IDBCache {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
