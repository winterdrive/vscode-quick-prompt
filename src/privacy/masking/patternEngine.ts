/**
 * Pattern-based Masking Engine
 * Quick Prompt v0.4.0 - Privacy Protection v2
 */

import { MaskType, PatternDefinition, PrivacyConfig } from '../types';
import { MASK_TYPE_SETTING_KEY } from '../patternRegistry';

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
 * Pattern Engine — 靜態工具方法
 * 實際遮罩邏輯已移至 PatternRegistry
 */
export class PatternEngine {
    /**
     * 靜態偵測：檢查文字是否含有任何敏感資訊（不遮罩、不產生 token）
     * 供 PromptItem 等模組快速判斷是否需要標記敏感警示
     * config 可選：若傳入則依 settings 開關過濾；不傳則以 hardcode 預設值為準
     */
    public static detect(text: string, config?: PrivacyConfig): boolean {
        // 先移除已被遮罩的 Token (例如 [EMAIL-1], [AWS-KEY-5]) 避免重複報警
        const cleanText = text.replace(/\[[A-Z0-9_-]+-\d+\]/g, '');
        for (const pattern of PREDEFINED_PATTERNS) {
            // 若有傳入 config，以 settings 開關決定是否偵測該 type
            if (config) {
                const settingKey = MASK_TYPE_SETTING_KEY[pattern.type];
                const enabled = settingKey !== undefined ? config.patterns[settingKey] : pattern.enabled;
                if (!enabled) { continue; }
            } else if (!pattern.enabled) {
                continue;
            }
            // 重新建立 regex 以重置 lastIndex，避免 stateful global regex 誤判
            const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
            if (regex.test(cleanText)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 靜態偵測：檢查文字中是否包含已遮罩的 Token 標記
     */
    public static hasMaskedTokens(text: string): boolean {
        return /\[[A-Z0-9_-]+-\d+\]/.test(text);
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
