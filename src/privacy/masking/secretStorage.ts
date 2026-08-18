/**
 * Secret Storage Manager
 * Stores tokenMap per prompt using VS Code SecretStorage API (OS-level encrypted).
 * The tokenMap never touches disk — it lives only in the OS keychain.
 */

import * as vscode from 'vscode';

const KEY_PREFIX = 'quickPrompt.tokenMap.';

export class SecretStorageManager {
    constructor(private secrets: vscode.SecretStorage) {}

    async store(promptId: string, tokenMap: Record<string, string>): Promise<void> {
        await this.secrets.store(KEY_PREFIX + promptId, JSON.stringify(tokenMap));
    }

    async retrieve(promptId: string): Promise<Record<string, string> | undefined> {
        const raw = await this.secrets.get(KEY_PREFIX + promptId);
        if (!raw) { return undefined; }
        try {
            const parsed: unknown = JSON.parse(raw);
            return SecretStorageManager.isValidTokenMap(parsed) ? parsed : undefined;
        } catch {
            return undefined;
        }
    }

    async delete(promptId: string): Promise<void> {
        await this.secrets.delete(KEY_PREFIX + promptId);
    }

    /**
     * Guards against secret-storage content that parses successfully but isn't a
     * plain string map (e.g. an array or a value with non-string entries), which
     * would otherwise corrupt prompt content when unmaskPromptContent iterates it.
     */
    private static isValidTokenMap(value: unknown): value is Record<string, string> {
        return !!value
            && typeof value === 'object'
            && !Array.isArray(value)
            && Object.values(value).every(v => typeof v === 'string');
    }
}
