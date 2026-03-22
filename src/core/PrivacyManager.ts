/**
 * Core Privacy Manager — pure Node.js, no vscode dependency.
 *
 * Provides:
 * - Pattern-based masking (18 predefined regex patterns)
 * - Privacy dictionary management (CRUD on `.vscode/privacy-dictionary.json`)
 * - Text masking/unmasking via stored token mappings
 *
 * NOTE: NER (Named Entity Recognition) is NOT available in MCP context
 * since it requires @xenova/transformers which needs vscode Worker Threads.
 * Pattern + Dictionary masking covers most use cases.
 */

import * as path from 'path';
import * as fs from 'fs';
import { DictionaryEntry, MaskToken, MaskType, MaskingResult, PatternDefinition } from './types.js';
import { PathUtils } from './PathUtils.js';

// ── Predefined patterns ───────────────────────────────────────────────────────

const PREDEFINED_PATTERNS: PatternDefinition[] = [
    // PII
    { name: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: MaskType.EMAIL, label: '[EMAIL-{n}]', enabled: true, priority: 1 },
    { name: 'Phone (Taiwan)', regex: /\b09\d{2}-?\d{3}-?\d{3}\b/g, type: MaskType.PHONE, label: '[PHONE-{n}]', enabled: true, priority: 2 },
    { name: 'Phone (US)', regex: /\b\d{3}-\d{3}-\d{4}\b/g, type: MaskType.PHONE, label: '[PHONE-{n}]', enabled: true, priority: 2 },
    { name: 'Phone (International)', regex: /\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/g, type: MaskType.PHONE, label: '[PHONE-{n}]', enabled: true, priority: 2 },
    { name: 'ID Card (Taiwan)', regex: /\b[A-Z][12]\d{8}\b/g, type: MaskType.ID_CARD, label: '[ID-{n}]', enabled: true, priority: 1 },
    { name: 'SSN (US)', regex: /\b\d{3}-\d{2}-\d{4}\b/g, type: MaskType.SSN, label: '[SSN-{n}]', enabled: true, priority: 1 },
    // API keys
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, type: MaskType.AWS_KEY, label: '[AWS-KEY-{n}]', enabled: true, priority: 0 },
    { name: 'GitHub Token (Classic)', regex: /ghp_[a-zA-Z0-9]{36}/g, type: MaskType.GITHUB_TOKEN, label: '[GITHUB-TOKEN-{n}]', enabled: true, priority: 0 },
    { name: 'GitHub Token (Fine-grained)', regex: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, type: MaskType.GITHUB_TOKEN, label: '[GITHUB-TOKEN-{n}]', enabled: true, priority: 0 },
    { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{48}/g, type: MaskType.OPENAI_KEY, label: '[OPENAI-KEY-{n}]', enabled: true, priority: 0 },
    { name: 'OpenAI API Key (Project)', regex: /sk-proj-[a-zA-Z0-9]{48,}/g, type: MaskType.OPENAI_KEY, label: '[OPENAI-KEY-{n}]', enabled: true, priority: 0 },
    { name: 'JWT Token', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, type: MaskType.JWT_TOKEN, label: '[JWT-{n}]', enabled: true, priority: 0 },
    { name: 'Generic API Key', regex: /\b[A-Za-z0-9]{32,64}\b/g, type: MaskType.API_KEY, label: '[API-KEY-{n}]', enabled: false, priority: 10 }, // disabled by default — too greedy
    // Financial
    { name: 'Credit Card', regex: /\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, type: MaskType.CREDIT_CARD, label: '[CARD-{n}]', enabled: false, priority: 1 },
    // Network
    { name: 'IPv4', regex: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, type: MaskType.IP_ADDRESS, label: '[IP-{n}]', enabled: true, priority: 3 },
    { name: 'IPv6', regex: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, type: MaskType.IPV6_ADDRESS, label: '[IPV6-{n}]', enabled: true, priority: 3 },
    // Private keys
    { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, type: MaskType.PRIVATE_KEY, label: '[PRIVATE-KEY-{n}]', enabled: true, priority: 0 },
];

// ── Dictionary Data ───────────────────────────────────────────────────────────

interface DictionaryFile {
    version: string;
    description: string;
    lastModified: string;
    entries: DictionaryEntry[];
}

// ── Privacy Manager ───────────────────────────────────────────────────────────

export class PrivacyManager {
    private dictionaryPath: string;
    private tokenStore: Map<string, MaskToken> = new Map(); // maskedValue → token
    private tokenCounter: Map<string, number> = new Map();  // type → count

    constructor(private workspaceRoot: string) {
        this.dictionaryPath = path.join(workspaceRoot, '.vscode', 'privacy-dictionary.json');
    }

    // ── Pattern Masking ───────────────────────────────────────────────────────

    /**
     * Mask sensitive information in text using patterns + dictionary.
     */
    maskText(text: string): MaskingResult {
        const startTime = Date.now();
        const tokens: MaskToken[] = [];
        let maskedText = text;
        const strategies: string[] = [];

        // Phase 1: Dictionary masking (highest priority)
        const dictEntries = this.getDictionaryEntries().filter(e => e.enabled);
        if (dictEntries.length > 0) {
            strategies.push('dictionary');
            for (const entry of dictEntries) {
                try {
                    const regex = entry.isRegex
                        ? new RegExp(entry.pattern, 'g')
                        : new RegExp(this.escapeRegex(entry.pattern), 'g');

                    let match: RegExpExecArray | null;
                    while ((match = regex.exec(maskedText)) !== null) {
                        const tokenId = this.generateTokenId();
                        const maskedValue = entry.label;
                        const token: MaskToken = {
                            id: tokenId,
                            originalValue: match[0],
                            maskedValue,
                            type: MaskType.CUSTOM,
                            createdAt: Date.now(),
                            reversible: true,
                            startPos: match.index,
                            endPos: match.index + match[0].length,
                        };
                        tokens.push(token);
                        this.tokenStore.set(maskedValue, token);
                        maskedText = maskedText.substring(0, match.index) + maskedValue + maskedText.substring(match.index + match[0].length);
                    }
                } catch { /* skip invalid regex */ }
            }
        }

        // Phase 2: Pattern masking
        strategies.push('pattern');
        const sortedPatterns = [...PREDEFINED_PATTERNS]
            .filter(p => p.enabled)
            .sort((a, b) => a.priority - b.priority);

        for (const pattern of sortedPatterns) {
            const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
            let match: RegExpExecArray | null;

            while ((match = regex.exec(maskedText)) !== null) {
                // Check overlap with existing tokens
                const isOverlapping = tokens.some(t =>
                    t.startPos !== undefined && t.endPos !== undefined &&
                    match!.index < t.endPos && (match!.index + match![0].length) > t.startPos
                );
                if (isOverlapping) continue;

                const count = (this.tokenCounter.get(pattern.type) ?? 0) + 1;
                this.tokenCounter.set(pattern.type, count);

                const tokenId = this.generateTokenId();
                const maskedValue = pattern.label.replace('{n}', count.toString());
                const token: MaskToken = {
                    id: tokenId,
                    originalValue: match[0],
                    maskedValue,
                    type: pattern.type,
                    createdAt: Date.now(),
                    reversible: true,
                    startPos: match.index,
                    endPos: match.index + match[0].length,
                };
                tokens.push(token);
                this.tokenStore.set(maskedValue, token);
                maskedText = maskedText.substring(0, match.index) + maskedValue + maskedText.substring(match.index + match[0].length);
            }
        }

        return {
            maskedText,
            originalText: text,
            tokens,
            processingTime: Date.now() - startTime,
            strategies,
        };
    }

    /**
     * Unmask text using stored token mappings.
     */
    unmaskText(maskedText: string): string {
        let result = maskedText;
        for (const [maskedValue, token] of this.tokenStore) {
            if (token.reversible && result.includes(maskedValue)) {
                result = result.replace(maskedValue, token.originalValue);
            }
        }
        return result;
    }

    /**
     * Clear all stored token mappings.
     */
    clearTokenStore(): number {
        const count = this.tokenStore.size;
        this.tokenStore.clear();
        this.tokenCounter.clear();
        return count;
    }

    /**
     * Get masking statistics.
     */
    getMaskingStats(): {
        totalTokens: number;
        tokensByType: Record<string, number>;
    } {
        const tokensByType: Record<string, number> = {};
        for (const [, token] of this.tokenStore) {
            tokensByType[token.type] = (tokensByType[token.type] ?? 0) + 1;
        }
        return {
            totalTokens: this.tokenStore.size,
            tokensByType,
        };
    }

    // ── Dictionary Management ─────────────────────────────────────────────────

    /**
     * Get all dictionary entries.
     */
    getDictionaryEntries(): DictionaryEntry[] {
        const data = this.loadDictionary();
        return data.entries;
    }

    /**
     * Get a single dictionary entry by ID.
     */
    getDictionaryEntry(entryId: string): DictionaryEntry | undefined {
        return this.getDictionaryEntries().find(e => e.id === entryId);
    }

    /**
     * Add a new dictionary entry.
     */
    addDictionaryEntry(entry: Omit<DictionaryEntry, 'id' | 'createdAt' | 'updatedAt'>): DictionaryEntry {
        const data = this.loadDictionary();
        const newEntry: DictionaryEntry = {
            ...entry,
            id: this.generateId(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        // Validate regex if applicable
        if (entry.isRegex) {
            try { new RegExp(entry.pattern); } catch (e) {
                throw new Error(`Invalid regex pattern: ${entry.pattern}`);
            }
        }

        data.entries.push(newEntry);
        this.saveDictionary(data);
        return newEntry;
    }

    /**
     * Edit an existing dictionary entry.
     */
    editDictionaryEntry(entryId: string, updates: Partial<Omit<DictionaryEntry, 'id' | 'createdAt' | 'updatedAt'>>): DictionaryEntry {
        const data = this.loadDictionary();
        const idx = data.entries.findIndex(e => e.id === entryId);
        if (idx === -1) {
            throw new Error(`Dictionary entry not found: ${entryId}`);
        }

        if (updates.isRegex && updates.pattern) {
            try { new RegExp(updates.pattern); } catch (e) {
                throw new Error(`Invalid regex pattern: ${updates.pattern}`);
            }
        }

        Object.assign(data.entries[idx], updates, { updatedAt: Date.now() });
        this.saveDictionary(data);
        return data.entries[idx];
    }

    /**
     * Delete a dictionary entry.
     */
    deleteDictionaryEntry(entryId: string): boolean {
        const data = this.loadDictionary();
        const idx = data.entries.findIndex(e => e.id === entryId);
        if (idx === -1) return false;
        data.entries.splice(idx, 1);
        this.saveDictionary(data);
        return true;
    }

    /**
     * Toggle enabled/disabled state of a dictionary entry.
     */
    toggleDictionaryEntry(entryId: string): DictionaryEntry {
        const data = this.loadDictionary();
        const entry = data.entries.find(e => e.id === entryId);
        if (!entry) {
            throw new Error(`Dictionary entry not found: ${entryId}`);
        }
        entry.enabled = !entry.enabled;
        entry.updatedAt = Date.now();
        this.saveDictionary(data);
        return entry;
    }

    // ── Dictionary I/O ────────────────────────────────────────────────────────

    private loadDictionary(): DictionaryFile {
        if (!fs.existsSync(this.dictionaryPath)) {
            const defaultData: DictionaryFile = {
                version: '1.0',
                description: 'Quick Prompt Privacy Dictionary',
                lastModified: new Date().toISOString(),
                entries: [],
            };
            return defaultData;
        }
        try {
            const content = fs.readFileSync(this.dictionaryPath, 'utf-8');
            return JSON.parse(content) as DictionaryFile;
        } catch {
            return { version: '1.0', description: 'Quick Prompt Privacy Dictionary', lastModified: new Date().toISOString(), entries: [] };
        }
    }

    private saveDictionary(data: DictionaryFile): void {
        data.lastModified = new Date().toISOString();
        PathUtils.writeJsonFile(this.dictionaryPath, data);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private generateTokenId(): string {
        return `tok_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    private generateId(): string {
        return `dict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
