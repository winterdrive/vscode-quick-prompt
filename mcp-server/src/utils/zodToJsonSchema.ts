/**
 * Zod v4 → JSON Schema converter for MCP tool input schemas.
 */

import { z } from 'zod';

type ZodShape = Record<string, z.ZodTypeAny>;

function getTypeName(zodType: z.ZodTypeAny): string {
    const def = (zodType as any)._def ?? (zodType as any).def;
    return def?.typeName ?? '';
}

function convertZodType(zodType: z.ZodTypeAny): Record<string, unknown> {
    const typeName = getTypeName(zodType);
    const def = (zodType as any)._def ?? (zodType as any).def;
    const description = (zodType as any).description ?? def?.description;

    switch (typeName) {
        case 'ZodOptional':
            return convertZodType(def.innerType);
        case 'ZodDefault':
            return convertZodType(def.innerType);
        case 'ZodString':
            return { type: 'string', ...(description && { description }) };
        case 'ZodNumber':
            return { type: 'number', ...(description && { description }) };
        case 'ZodBoolean':
            return { type: 'boolean', ...(description && { description }) };
        case 'ZodEnum': {
            let values: string[];
            if (Array.isArray(def.values)) {
                values = def.values;
            } else if (def.entries) {
                values = Object.values(def.entries) as string[];
            } else {
                values = [];
            }
            return { type: 'string', enum: values, ...(description && { description }) };
        }
        case 'ZodArray': {
            const items = convertZodType(def.type ?? def.element);
            return { type: 'array', items, ...(description && { description }) };
        }
        case 'ZodObject': {
            const shape: ZodShape = typeof def.shape === 'function' ? def.shape() : def.shape;
            return zodToJsonSchema(shape);
        }
        default:
            return { type: 'string', ...(description && { description }) };
    }
}

function isOptionalType(zodType: z.ZodTypeAny): boolean {
    const typeName = getTypeName(zodType);
    return typeName === 'ZodOptional' || typeName === 'ZodDefault';
}

export function zodToJsonSchema(shape: ZodShape): Record<string, unknown> {
    if (!shape || Object.keys(shape).length === 0) {
        return { type: 'object', properties: {} };
    }

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, zodType] of Object.entries(shape)) {
        properties[key] = convertZodType(zodType);
        if (!isOptionalType(zodType)) {
            required.push(key);
        }
    }

    return {
        type: 'object',
        properties,
        ...(required.length > 0 && { required }),
    };
}
