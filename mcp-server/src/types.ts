/**
 * MCP Server type definitions for Quick Prompt.
 *
 * Shared data-model types are re-exported from the core extension source.
 * Only MCP-specific types are defined here.
 */

// ── Re-export shared types from the core ──────────────────────────────────────
export type {
    Prompt,
    PromptVersion,
    VersionHistory,
    CreateVersionOptions,
    MaskToken,
    MaskingResult,
    DictionaryEntry,
    PatternDefinition,
} from '../../src/core/types.js';

export { MaskType, PROMPT_CONSTANTS } from '../../src/core/types.js';

// ── MCP-specific types ────────────────────────────────────────────────────────

/**
 * Summary shape returned by list_prompts.
 */
export interface PromptSummary {
    id: string;
    title: string;
    contentPreview: string;
    use_count: number;
    pinned: boolean;
    created_at: string;
    last_used: string | null;
    order: number;
}

/**
 * Summary for version listing.
 */
export interface VersionSummary {
    versionId: string;
    contentPreview: string;
    timestamp: number;
    changeType: 'create' | 'edit' | 'restore';
    milestone?: {
        label: string;
        createdAt: number;
    };
}

/**
 * Well-known error categories for MCP tool responses.
 */
export enum ErrorType {
    VALIDATION_ERROR = 'validation_error',
    NOT_FOUND = 'not_found',
    NOT_INITIALIZED = 'not_initialized',
    IO_ERROR = 'io_error',
    PERMISSION_ERROR = 'permission_error',
    CONFLICT_ERROR = 'conflict_error',
    INTERNAL_ERROR = 'internal_error',
}

/** Successful MCP tool response. */
export interface SuccessResponse<T> {
    success: true;
    data: T;
    message?: string;
    warning?: boolean;
}

/** Failed MCP tool response. */
export interface ErrorResponse {
    success: false;
    error: ErrorType;
    message: string;
    details?: unknown;
}

/** Union of all possible MCP tool response shapes. */
export type ToolResponse<T> = SuccessResponse<T> | ErrorResponse;
