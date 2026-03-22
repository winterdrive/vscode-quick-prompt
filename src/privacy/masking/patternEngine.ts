/**
 * Pattern-based Masking Engine
 * Quick Prompt v0.3.0 - Privacy Protection
 */

import { MaskType, PatternDefinition, MaskToken } from '../types';

/**
 * 預定義的正則表達式模式
 */
export const PREDEFINED_PATTERNS: PatternDefinition[] = [
    // ====== 個人識別資訊 (PII) ======
    {
        name: 'Email',
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        type: MaskType.EMAIL,
        label: '[EMAIL-{n}]',
        enabled: true,
        priority: 1
    },
    {
        name: 'Phone (Taiwan)',
        regex: /\b09\d{2}-?\d{3}-?\d{3}\b/g,
        type: MaskType.PHONE,
        label: '[PHONE-{n}]',
        enabled: true,
        priority: 2
    },
    {
        name: 'Phone (US)',
        regex: /\b\d{3}-\d{3}-\d{4}\b/g,
        type: MaskType.PHONE,
        label: '[PHONE-{n}]',
        enabled: true,
        priority: 2
    },
    {
        name: 'Phone (International)',
        regex: /\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/g,
        type: MaskType.PHONE,
        label: '[PHONE-{n}]',
        enabled: true,
        priority: 2
    },
    {
        name: 'ID Card (Taiwan)',
        regex: /\b[A-Z][12]\d{8}\b/g,
        type: MaskType.ID_CARD,
        label: '[ID-{n}]',
        enabled: true,
        priority: 1
    },
    {
        name: 'SSN (US)',
        regex: /\b\d{3}-\d{2}-\d{4}\b/g,
        type: MaskType.SSN,
        label: '[SSN-{n}]',
        enabled: true,
        priority: 1
    },

    // ====== API 認證資訊 ======
    {
        name: 'AWS Access Key',
        regex: /AKIA[0-9A-Z]{16}/g,
        type: MaskType.AWS_KEY,
        label: '[AWS-KEY-{n}]',
        enabled: true,
        priority: 0  // 最高優先級
    },
    {
        name: 'GitHub Token (Classic)',
        regex: /ghp_[a-zA-Z0-9]{36}/g,
        type: MaskType.GITHUB_TOKEN,
        label: '[GITHUB-TOKEN-{n}]',
        enabled: true,
        priority: 0
    },
    {
        name: 'GitHub Token (Fine-grained)',
        regex: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
        type: MaskType.GITHUB_TOKEN,
        label: '[GITHUB-TOKEN-{n}]',
        enabled: true,
        priority: 0
    },
    {
        name: 'OpenAI API Key',
        regex: /sk-[a-zA-Z0-9]{48}/g,
        type: MaskType.OPENAI_KEY,
        label: '[OPENAI-KEY-{n}]',
        enabled: true,
        priority: 0
    },
    {
        name: 'OpenAI API Key (Project)',
        regex: /sk-proj-[a-zA-Z0-9]{48,}/g,
        type: MaskType.OPENAI_KEY,
        label: '[OPENAI-KEY-{n}]',
        enabled: true,
        priority: 0
    },
    {
        name: 'JWT Token',
        regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
        type: MaskType.JWT_TOKEN,
        label: '[JWT-{n}]',
        enabled: true,
        priority: 0
    },
    {
        name: 'Generic API Key',
        regex: /[a-zA-Z0-9_-]{32,}/g,
        type: MaskType.API_KEY,
        label: '[API-KEY-{n}]',
        enabled: false,  // 預設關閉，避免誤判
        priority: 10
    },

    // ====== 金融資訊 ======
    {
        name: 'Credit Card',
        regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
        type: MaskType.CREDIT_CARD,
        label: '[CARD-{n}]',
        enabled: false,  // 預設關閉，避免誤判
        priority: 3
    },

    // ====== 網路資訊 ======
    {
        name: 'IPv4',
        regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        type: MaskType.IP_ADDRESS,
        label: '[IP-{n}]',
        enabled: true,
        priority: 2
    },
    {
        name: 'IPv6',
        regex: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
        type: MaskType.IPV6_ADDRESS,
        label: '[IPV6-{n}]',
        enabled: true,
        priority: 2
    },
    {
        name: 'Private Key (RSA)',
        regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (RSA |EC )?PRIVATE KEY-----/g,
        type: MaskType.PRIVATE_KEY,
        label: '[PRIVATE-KEY-{n}]',
        enabled: true,
        priority: 0
    }
];

/**
 * Pattern Masking Engine
 * 使用正則表達式進行隱私遮罩
 */
export class PatternEngine {
    private patterns: Map<string, PatternDefinition> = new Map();
    private tokenCounter: Map<MaskType, number> = new Map();

    constructor() {
        this.initializePatterns();
    }

    /**
     * 初始化預定義模式
     */
    private initializePatterns(): void {
        PREDEFINED_PATTERNS.forEach(pattern => {
            this.patterns.set(pattern.name, pattern);
        });
    }

    /**
     * 啟用/停用指定模式
     */
    public setPatternEnabled(name: string, enabled: boolean): void {
        const pattern = this.patterns.get(name);
        if (pattern) {
            pattern.enabled = enabled;
        }
    }

    /**
     * 取得所有模式
     */
    public getPatterns(): PatternDefinition[] {
        return Array.from(this.patterns.values());
    }

    /**
     * 執行遮罩
     */
    public mask(text: string, enabledPatterns?: string[]): { maskedText: string; tokens: MaskToken[] } {
        const startTime = Date.now();
        const tokens: MaskToken[] = [];
        let maskedText = text;
        
        // 重置計數器
        this.tokenCounter.clear();

        // 取得要使用的模式（按優先級排序）
        const patternsToUse = this.getEnabledPatterns(enabledPatterns);
        
        // 為避免重複遮罩，記錄已處理的位置
        const maskedRanges: Array<{ start: number; end: number }> = [];

        // 按優先級遞增順序處理（優先級低的先處理）
        patternsToUse.sort((a, b) => b.priority - a.priority);

        for (const pattern of patternsToUse) {
            const matches = Array.from(maskedText.matchAll(pattern.regex));
            
            for (const match of matches) {
                if (!match.index) continue;
                
                const start = match.index;
                const end = start + match[0].length;
                
                // 檢查是否已被遮罩
                if (this.isOverlapping(start, end, maskedRanges)) {
                    continue;
                }
                
                // 生成遮罩 token
                const token = this.createToken(match[0], pattern.type, pattern.label);
                tokens.push(token);
                
                // 替換文字
                maskedText = maskedText.substring(0, start) + token.maskedValue + maskedText.substring(end);
                
                // 記錄已遮罩範圍
                maskedRanges.push({ start, end });
                
                // 調整後續的匹配位置
                const lengthDiff = token.maskedValue.length - match[0].length;
                maskedRanges.forEach(range => {
                    if (range.start > start) {
                        range.start += lengthDiff;
                        range.end += lengthDiff;
                    }
                });
            }
        }

        return { maskedText, tokens };
    }

    /**
     * 取得啟用的模式
     */
    private getEnabledPatterns(enabledPatterns?: string[]): PatternDefinition[] {
        const patterns = Array.from(this.patterns.values());
        
        if (enabledPatterns) {
            return patterns.filter(p => enabledPatterns.includes(p.name) && p.enabled);
        }
        
        return patterns.filter(p => p.enabled);
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
     * 建立遮罩 Token
     */
    private createToken(originalValue: string, type: MaskType, labelTemplate: string): MaskToken {
        // 取得並遞增計數器
        const counter = (this.tokenCounter.get(type) || 0) + 1;
        this.tokenCounter.set(type, counter);
        
        // 生成遮罩標籤
        const maskedValue = labelTemplate.replace('{n}', counter.toString());
        
        return {
            id: this.generateTokenId(),
            originalValue,
            maskedValue,
            type,
            createdAt: Date.now(),
            reversible: true
        };
    }

    /**
     * 生成唯一 Token ID
     */
    private generateTokenId(): string {
        return `token_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * 驗證正則表達式安全性（防止 ReDoS）
     */
    public static validateRegex(pattern: string, timeout: number = 100): boolean {
        // 檢查危險模式
        const dangerousPatterns = [
            /(\.\*){2,}/,  // 多個 .*
            /(\+|\*){2,}/, // 多個 + 或 *
            /(.*\+.*\+)/   // 嵌套的 +
        ];
        
        for (const dangerous of dangerousPatterns) {
            if (dangerous.test(pattern)) {
                return false;
            }
        }
        
        // 測試執行時間
        try {
            const regex = new RegExp(pattern);
            const testString = 'a'.repeat(100);
            const startTime = Date.now();
            
            regex.test(testString);
            
            return Date.now() - startTime < timeout;
        } catch (e) {
            return false;
        }
    }
}
