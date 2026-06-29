import * as vscode from 'vscode';

/**
 * OpenAI chat message format
 */
interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * OpenAI-compatible API response shape
 */
interface OpenAIChatResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    model?: string;
    error?: {
        message: string;
    };
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
    ok: boolean;
    model?: string;
    error?: string;
}

/**
 * Lightweight OpenAI-compatible HTTP client
 *
 * Uses native Node.js fetch (18+) — no external dependencies.
 * Supports Ollama, LM Studio, and any OpenAI-compatible endpoint.
 */
export class OpenAICompatibleClient {
    private endpoint!: string;
    private model!: string;
    private apiKey!: string;
    private timeout!: number;

    constructor() {
        this.reload();
    }

    /**
     * Reload configuration from VS Code settings
     */
    reload(): void {
        const cfg = vscode.workspace.getConfiguration('quickPrompt.ai.openaiCompatible');
        this.endpoint = cfg.get<string>('endpoint', 'http://localhost:11434/v1').replace(/\/$/, '');
        this.model    = cfg.get<string>('model', 'qwen2.5:0.5b');
        this.apiKey   = cfg.get<string>('apiKey', '');
        this.timeout  = cfg.get<number>('timeout', 15000);
    }

    /**
     * Send a chat completion request and return the assistant's reply text
     */
    async chat(messages: OpenAIMessage[], maxTokens: number = 60): Promise<string> {
        const url = `${this.endpoint}/chat/completions`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
        };

        const body = JSON.stringify({
            model: this.model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.1,
            stream: false
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json() as OpenAIChatResponse;

            if (data.error) {
                throw new Error(data.error.message);
            }

            const content = data.choices?.[0]?.message?.content?.trim() ?? '';
            if (!content) {
                throw new Error('Empty response from API');
            }

            return content;

        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`Request timed out after ${this.timeout}ms`);
            }
            throw err;
        }
    }

    /**
     * Test connectivity: send a minimal chat request and verify the response
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            await this.chat([
                { role: 'user', content: 'Reply with "ok" only.' }
            ], 5);

            return {
                ok: true,
                model: this.model
            };
        } catch (err: any) {
            return {
                ok: false,
                error: err.message ?? String(err)
            };
        }
    }

    /**
     * Get current configuration snapshot for logging/debug
     */
    getConfig(): { endpoint: string; model: string; timeout: number } {
        return { endpoint: this.endpoint, model: this.model, timeout: this.timeout };
    }
}
