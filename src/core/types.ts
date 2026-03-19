/**
 * Shared type definitions for Quick Prompt.
 * Pure TypeScript — no vscode dependency.
 * Used by both the VS Code extension and the MCP server.
 */

// ── Prompt ────────────────────────────────────────────────────────────────────

export interface Prompt {
    id: string;
    title: string;
    content: string;
    use_count: number;
    last_used: string;     // ISO date string
    created_at: string;    // ISO date string
    pinned?: boolean;
    order?: number;
    titleSource?: 'user' | 'ai';
    meta?: {
        totalVersions: number;
        latestVersionId?: string;
    };
}

// ── Version History ───────────────────────────────────────────────────────────

export interface PromptVersion {
    versionId: string;
    content: string;
    timestamp: number;
    changeType: 'create' | 'edit' | 'restore';
    milestone?: {
        label: string;
        createdAt: number;
    };
}

export interface VersionHistory {
    promptId: string;
    versions: PromptVersion[];
    currentVersionId: string;
}

export interface CreateVersionOptions {
    content: string;
    changeType: 'create' | 'edit' | 'restore';
    milestoneLabel?: string;
}

// ── Privacy ───────────────────────────────────────────────────────────────────

export enum MaskType {
    EMAIL = 'EMAIL',
    PHONE = 'PHONE',
    SSN = 'SSN',
    ID_CARD = 'ID_CARD',
    API_KEY = 'API_KEY',
    AWS_KEY = 'AWS_KEY',
    GITHUB_TOKEN = 'GITHUB_TOKEN',
    OPENAI_KEY = 'OPENAI_KEY',
    JWT_TOKEN = 'JWT_TOKEN',
    CREDIT_CARD = 'CREDIT_CARD',
    BANK_ACCOUNT = 'BANK_ACCOUNT',
    IP_ADDRESS = 'IP_ADDRESS',
    IPV6_ADDRESS = 'IPV6_ADDRESS',
    PRIVATE_KEY = 'PRIVATE_KEY',
    PERSON = 'PERSON',
    ORGANIZATION = 'ORGANIZATION',
    LOCATION = 'LOCATION',
    DATE = 'DATE',
    MONEY = 'MONEY',
    CUSTOM = 'CUSTOM',
    MISC = 'MISC',
}

export interface MaskToken {
    id: string;
    originalValue: string;
    maskedValue: string;
    type: MaskType;
    createdAt: number;
    reversible: boolean;
    startPos?: number;
    endPos?: number;
    confidence?: number;
}

export interface MaskingResult {
    maskedText: string;
    originalText: string;
    tokens: MaskToken[];
    processingTime: number;
    strategies: string[];
}

export interface DictionaryEntry {
    id: string;
    pattern: string;
    isRegex: boolean;
    label: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
    note?: string;
}

export interface PatternDefinition {
    name: string;
    regex: RegExp;
    type: MaskType;
    label: string;
    enabled: boolean;
    priority: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const PROMPT_CONSTANTS = {
    USE_COUNT_THRESHOLD_HIGH: 10,
    USE_COUNT_THRESHOLD_MEDIUM: 5,
    PREVIEW_MAX_LENGTH: 200,
    AUTO_TITLE_MAX_LENGTH: 30,
    ID_PADDING_LENGTH: 3,
    MAX_VERSIONS: 15,
} as const;
