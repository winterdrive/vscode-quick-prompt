/**
 * Response factory utilities for consistent MCP tool responses.
 */

import type { ToolResponse, ErrorType } from '../types.js';

export function createSuccess<T>(data: T, message?: string): ToolResponse<T> {
    return {
        success: true as const,
        data,
        ...(message && { message }),
    };
}

export function createError(errorType: ErrorType, message: string, details?: unknown): ToolResponse<never> {
    return {
        success: false as const,
        error: errorType,
        message,
        ...(details !== undefined && { details }),
    };
}

export function createWarning<T>(data: T, message: string): ToolResponse<T> {
    return {
        success: true as const,
        data,
        message,
        warning: true,
    };
}

/**
 * Format a ToolResponse into MCP CallToolResult content.
 */
export function toMcpResult(response: ToolResponse<unknown>): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
    const text = JSON.stringify(response, null, 2);
    return {
        content: [{ type: 'text' as const, text }],
        ...(response.success === false && { isError: true }),
    };
}
