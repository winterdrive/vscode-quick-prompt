/**
 * Core module barrel export.
 * Re-exports all core modules for easy consumption.
 */

export { PromptManager, OptimisticLockError } from './PromptManager.js';
export type { LoadResult } from './PromptManager.js';
export { VersionManager } from './VersionManager.js';
// export { PrivacyManager } from './PrivacyManager.js';
export { PathUtils } from './PathUtils.js';
export type {
    Prompt,
    PromptVersion,
    VersionHistory,
    CreateVersionOptions,
    MaskType,
    MaskToken,
    MaskingResult,
    DictionaryEntry,
    PatternDefinition,
    PROMPT_CONSTANTS,
} from './types.js';
