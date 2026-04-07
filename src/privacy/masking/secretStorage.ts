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
            return JSON.parse(raw) as Record<string, string>;
        } catch {
            return undefined;
        }
    }

    async delete(promptId: string): Promise<void> {
        await this.secrets.delete(KEY_PREFIX + promptId);
    }
}
