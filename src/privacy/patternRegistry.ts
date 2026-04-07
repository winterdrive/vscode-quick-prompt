/**
 * Pattern Registry
 * Unified source of truth for all masking rules (built-in + custom).
 * Quick Prompt v0.4.0 - Privacy Protection v2 / Phase 3
 */

import { MaskType, MaskToken, PatternDefinition, DictionaryEntry, PrivacyConfig } from './types';

/**
 * MaskType → settings key 對照（與 patternEngine.ts 保持一致）
 * 兩邊都定義是為了讓 PatternEngine 的 static detect() 繼續獨立運作；
 * 等 Phase 3 完成後可以將 patternEngine.ts 的對照移除。
 */
export const MASK_TYPE_SETTING_KEY: Partial<Record<MaskType, keyof PrivacyConfig['patterns']>> = {
    [MaskType.EMAIL]:        'email',
    [MaskType.PHONE]:        'phone',
    [MaskType.ID_CARD]:      'idCard',
    [MaskType.SSN]:          'idCard',
    [MaskType.AWS_KEY]:      'apiKeys',
    [MaskType.GITHUB_TOKEN]: 'apiKeys',
    [MaskType.OPENAI_KEY]:   'apiKeys',
    [MaskType.JWT_TOKEN]:    'apiKeys',
    [MaskType.API_KEY]:      'apiKeys',
    [MaskType.CREDIT_CARD]:  'creditCard',
    [MaskType.IP_ADDRESS]:   'ipAddress',
    [MaskType.IPV6_ADDRESS]: 'ipAddress',
    [MaskType.PRIVATE_KEY]:  'privateKey',
};

/**
 * 統一的 Pattern 介面
 * 內建規則和自訂規則都用這個結構在 registry 內部存放
 */
interface Pattern {
    id: string;
    name: string;
    regex: RegExp;
    type: MaskType;
    label: string;          // "[EMAIL-{n}]"，{n} 由 mask() 依序填入
    enabled: boolean;
    priority: number;       // 數字越小優先級越高
    builtIn: boolean;
}

/**
 * 統一遮罩結果
 */
export interface RegistryMaskResult {
    maskedText: string;
    tokens: MaskToken[];
}

/**
 * Pattern Registry
 * 管理所有內建與自訂規則，提供統一的 mask() 入口
 */
export class PatternRegistry {
    private patterns: Map<string, Pattern> = new Map();
    private tokenCounter: Map<MaskType, number> = new Map();

    /**
     * 從 PatternDefinition 陣列載入內建規則
     */
    loadBuiltIn(definitions: PatternDefinition[]): void {
        for (const def of definitions) {
            this.patterns.set(def.name, {
                id: def.name,
                name: def.name,
                regex: def.regex,
                type: def.type,
                label: def.label,
                enabled: def.enabled,
                priority: def.priority,
                builtIn: true
            });
        }
    }

    /**
     * 從 DictionaryEntry 陣列載入自訂規則
     * 自訂規則優先級最高（priority: -1）
     */
    loadCustom(entries: DictionaryEntry[]): void {
        // 先清除所有舊的自訂規則
        for (const [id, p] of this.patterns) {
            if (!p.builtIn) { this.patterns.delete(id); }
        }

        for (const entry of entries) {
            if (!entry.enabled) { continue; }
            try {
                const regex = entry.isRegex
                    ? new RegExp(entry.pattern, 'g')
                    : new RegExp(entry.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

                this.patterns.set(entry.id, {
                    id: entry.id,
                    name: entry.label,
                    regex,
                    type: MaskType.CUSTOM,
                    label: entry.label,
                    enabled: true,
                    priority: -1,  // 自訂規則最高優先
                    builtIn: false
                });
            } catch (e) {
                console.warn(`[PatternRegistry] Invalid pattern "${entry.pattern}", skipping`);
            }
        }
    }

    /**
     * 根據 PrivacyConfig 同步內建規則的啟用狀態
     */
    applyConfig(config: PrivacyConfig): void {
        for (const pattern of this.patterns.values()) {
            if (!pattern.builtIn) { continue; }
            const settingKey = MASK_TYPE_SETTING_KEY[pattern.type];
            if (settingKey !== undefined) {
                pattern.enabled = config.patterns[settingKey];
            }
        }
    }

    /**
     * 統一執行遮罩
     */
    mask(text: string, options?: { enableBuiltIn?: boolean; enableCustom?: boolean }): RegistryMaskResult {
        this.tokenCounter.clear();
        const tokens: MaskToken[] = [];
        let maskedText = text;
        const maskedRanges: Array<{ start: number; end: number }> = [];

        const useBuiltIn = options?.enableBuiltIn !== false;
        const useCustom  = options?.enableCustom  !== false;

        // 依優先級排序（數字小的先執行，自訂規則 -1 最先）
        const sorted = Array.from(this.patterns.values())
            .filter(p => p.enabled)
            .filter(p => p.builtIn ? useBuiltIn : useCustom)
            .sort((a, b) => a.priority - b.priority);

        for (const pattern of sorted) {
            // 重新建立 regex 以重置 lastIndex
            const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
            const matches = Array.from(maskedText.matchAll(regex));

            for (const match of matches) {
                if (match.index === undefined) { continue; }
                const start = match.index;
                const end = start + match[0].length;

                if (this.isOverlapping(start, end, maskedRanges)) { continue; }

                const token = this.createToken(match[0], pattern.type, pattern.label);
                tokens.push(token);

                maskedText = maskedText.substring(0, start) + token.maskedValue + maskedText.substring(end);
                maskedRanges.push({ start, end });

                const diff = token.maskedValue.length - match[0].length;
                for (const r of maskedRanges) {
                    if (r.start > start) { r.start += diff; r.end += diff; }
                }
            }
        }

        return { maskedText, tokens };
    }

    /**
     * 取得所有 Pattern（供 PatternEngine.getPatterns() 向下相容用）
     */
    getAllPatterns(): Pattern[] {
        return Array.from(this.patterns.values());
    }

    // ── Private ──────────────────────────────────────────────────────────────────

    private isOverlapping(start: number, end: number, ranges: Array<{ start: number; end: number }>): boolean {
        return ranges.some(r =>
            (start >= r.start && start < r.end) ||
            (end > r.start && end <= r.end) ||
            (start <= r.start && end >= r.end)
        );
    }

    private createToken(originalValue: string, type: MaskType, labelTemplate: string): MaskToken {
        const n = (this.tokenCounter.get(type) || 0) + 1;
        this.tokenCounter.set(type, n);
        return {
            id: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            originalValue,
            maskedValue: labelTemplate.replace('{n}', n.toString()),
            type,
            createdAt: Date.now(),
            reversible: true
        };
    }
}
