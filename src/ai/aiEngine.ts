import * as vscode from 'vscode';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { OpenAICompatibleClient } from './openAIClient';

/**
 * AI 引擎狀態
 */
type AIEngineStatus = 'uninitialized' | 'initializing' | 'ready' | 'error' | 'disabled';

/**
 * AI 提供者類型
 */
export type AIProvider = 'none' | 'local-qwen' | 'openai-compatible';

/**
 * 內容分類結果
 */
export interface ContentClassification {
    type: 'code' | 'text' | 'json' | 'markdown';
    language?: string;
}

/**
 * AI 引擎 — 提供文字摘要、內容分類和標籤建議功能
 *
 * 支援三種 provider 模式：
 * - none           : AI 功能關閉，標題由規則產生（預設）
 * - local-qwen     : 使用內建 Qwen 0.5B（Worker Thread，延遲下載）
 * - openai-compatible : 透過 HTTP API 串接 Ollama/LM Studio 等外部服務
 */
export class AIEngine {
    private static instance: AIEngine | null = null;
    private status: AIEngineStatus = 'uninitialized';
    private provider: AIProvider = 'none';

    // local-qwen 相關
    private worker: Worker | null = null;
    private initPromise: Promise<void> | null = null;
    private pendingRequests: Map<number, { resolve: (value: string) => void, reject: (reason: any) => void }> = new Map();
    private loadingProgress: vscode.Progress<{ message?: string; increment?: number }> | null = null;

    // openai-compatible 相關
    private openAIClient: OpenAICompatibleClient | null = null;

    private constructor() { }

    /**
     * 取得 AIEngine 單例
     */
    static getInstance(): AIEngine {
        if (!AIEngine.instance) {
            AIEngine.instance = new AIEngine();
        }
        return AIEngine.instance;
    }

    /**
     * 初始化 AI 引擎
     *
     * 讀取設定後：
     * - enabled=false  → status=disabled，直接返回
     * - provider=local-qwen        → 啟動 Worker Thread 載入 Qwen
     * - provider=openai-compatible → 建立輕量 HTTP client
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        const config = vscode.workspace.getConfiguration('quickPrompt.ai');
        const enabled = config.get<boolean>('enabled', false);

        if (!enabled) {
            this.status = 'disabled';
            this.provider = 'none';
            console.log('[AIEngine] AI features disabled by user (enabled=false)');
            return;
        }

        const providerSetting = config.get<string>('provider', 'local-qwen') as AIProvider;
        this.provider = providerSetting;

        if (this.status === 'ready') return;
        if (this.status === 'initializing' && this.initPromise) return this.initPromise;

        switch (providerSetting) {
            case 'openai-compatible':
                return this.initializeOpenAI();
            case 'local-qwen':
                this.status = 'initializing';
                this.initPromise = this.initializeQwen(context);
                return this.initPromise;
            default:
                this.status = 'disabled';
                this.provider = 'none';
        }
    }

    // ──────────────────────────────────────────────────────────
    // Private: openai-compatible 初始化
    // ──────────────────────────────────────────────────────────

    private async initializeOpenAI(): Promise<void> {
        try {
            this.openAIClient = new OpenAICompatibleClient();
            // 標記 ready：實際連線在首次呼叫 summarize() 時才驗證
            this.status = 'ready';
            const { endpoint, model } = this.openAIClient.getConfig();
            console.log(`[AIEngine] OpenAI-compatible client ready → ${endpoint} (model: ${model})`);
        } catch (error) {
            this.status = 'error';
            console.error('[AIEngine] Failed to initialize OpenAI client:', error);
        }
    }

    // ──────────────────────────────────────────────────────────
    // Private: local-qwen 初始化（Worker Thread）
    // ──────────────────────────────────────────────────────────

    private async initializeQwen(context: vscode.ExtensionContext): Promise<void> {
        try {
            const workerPath = path.join(__dirname, 'aiWorker.js');
            console.log('[AIEngine] Spawning Qwen worker from:', workerPath);

            this.worker = new Worker(workerPath);

            this.worker.on('message', (message) => this.handleWorkerMessage(message));

            this.worker.on('error', (error) => {
                console.error('[AIEngine] Worker error:', error);
                this.status = 'error';
            });

            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`[AIEngine] Worker stopped with exit code ${code}`);
                    this.status = 'error';
                }
            });

            const cacheDir = vscode.Uri.joinPath(
                vscode.Uri.file(process.env.HOME || process.env.USERPROFILE || ''),
                '.cache',
                'quickprompt-models'
            ).fsPath;

            return new Promise((resolve, reject) => {
                const checkStatus = () => {
                    if (this.status === 'ready') {
                        resolve();
                    } else if (this.status === 'error') {
                        reject(new Error('Worker initialization failed'));
                    } else {
                        setTimeout(checkStatus, 100);
                    }
                };

                const modelKey = vscode.workspace.getConfiguration('quickPrompt.ai').get<string>('localModel', 'smollm2-360m');
                this.worker?.postMessage({ command: 'init', cacheDir, modelKey });

                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Quick Prompt: Loading Qwen model...',
                    cancellable: false
                }, async (progress) => {
                    this.loadingProgress = progress;

                    try {
                        await new Promise<void>((res, rej) => {
                            const interval = setInterval(() => {
                                if (this.status === 'ready') {
                                    clearInterval(interval);
                                    res();
                                } else if (this.status === 'error') {
                                    clearInterval(interval);
                                    rej(new Error('Worker initialization failed'));
                                }
                            }, 200);
                        });
                    } finally {
                        this.loadingProgress = null;
                    }
                }).then(undefined, () => { /* rejection handled by the outer promise */ });

                checkStatus();
            });

        } catch (error) {
            this.status = 'error';
            console.error('[AIEngine] Qwen initialization failed:', error);
            vscode.window.showWarningMessage(
                `Quick Prompt: Qwen model loading failed (${error instanceof Error ? error.message : String(error)}). Using fallback title generation.`
            );
        }
    }

    // ──────────────────────────────────────────────────────────
    // Worker message handler (local-qwen only)
    // ──────────────────────────────────────────────────────────

    private handleWorkerMessage(message: any) {
        switch (message.type) {
            case 'status':
                if (message.status === 'ready') {
                    this.status = 'ready';
                    console.log('[AIEngine] Qwen worker ready');
                    this.loadingProgress?.report({ message: 'Model loaded!' });
                }
                break;
            case 'progress':
                if (this.loadingProgress) {
                    this.loadingProgress.report({
                        message: message.message,
                        increment: message.increment
                    });
                }
                break;
            case 'result': {
                const req = this.pendingRequests.get(message.requestId);
                if (req) {
                    req.resolve(message.title);
                    this.pendingRequests.delete(message.requestId);
                }
                break;
            }
            case 'error':
                console.error('[AIEngine] Worker reported error:', message.error);
                this.status = 'error';
                break;
        }
    }

    // ──────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────

    /**
     * 檢查 AI 引擎是否可用
     */
    isReady(): boolean {
        return this.status === 'ready';
    }

    /**
     * 取得當前狀態
     */
    getStatus(): AIEngineStatus {
        return this.status;
    }

    /**
     * 取得目前使用的 provider
     */
    getProvider(): AIProvider {
        return this.provider;
    }

    /**
     * 生成文字摘要（用於自動生成標題）
     *
     * 根據 provider 分派到不同實作：
     * - local-qwen        → Worker Thread
     * - openai-compatible → HTTP API
     * - 其他              → simpleFallback
     */
    async summarize(text: string, maxLength: number = 50): Promise<string> {
        if (!this.isReady()) {
            return this.simpleFallback(text, maxLength);
        }

        // 檢查功能開關
        const featureEnabled = vscode.workspace.getConfiguration('quickPrompt.ai.features')
            .get<boolean>('titleGeneration', true);
        if (!featureEnabled) {
            return this.simpleFallback(text, maxLength);
        }

        if (this.provider === 'openai-compatible' && this.openAIClient) {
            return this.summarizeViaOpenAI(text, maxLength);
        }

        if (this.provider === 'local-qwen' && this.worker) {
            return this.summarizeViaWorker(text, maxLength);
        }

        return this.simpleFallback(text, maxLength);
    }

    /**
     * 透過 OpenAI-compatible API 生成摘要
     */
    private async summarizeViaOpenAI(text: string, maxLength: number): Promise<string> {
        try {
            const truncated = text.length > 2000 ? text.substring(0, 2000) + '...' : text;

            const result = await this.openAIClient!.chat([
                {
                    role: 'system',
                    content: `You are a title generator. Generate a concise title (under ${maxLength} characters) for the given text. Output the title only, no explanation, no quotes, no markdown.`
                },
                {
                    role: 'user',
                    content: truncated
                }
            ], maxLength);

            return this.cleanTitle(result);
        } catch (error) {
            console.warn('[AIEngine] OpenAI summarize failed, using fallback:', error);
            return this.simpleFallback(text, maxLength);
        }
    }

    /**
     * 透過 Worker Thread（local-qwen）生成摘要
     */
    private summarizeViaWorker(text: string, maxLength: number): Promise<string> {
        return new Promise((resolve) => {
            const requestId = Date.now() + Math.random();

            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    console.warn('[AIEngine] Worker request timed out');
                    resolve(this.simpleFallback(text, maxLength));
                }
            }, 90000);

            this.pendingRequests.set(requestId, {
                resolve: (title) => {
                    clearTimeout(timeoutId);
                    resolve(title);
                },
                reject: () => {
                    clearTimeout(timeoutId);
                    resolve(this.simpleFallback(text, maxLength));
                }
            });

            const enableThinking = vscode.workspace.getConfiguration('quickPrompt.ai').get<boolean>('enableThinking', false);
            this.worker?.postMessage({ command: 'summarize', text, maxLength, requestId, thinking: enableThinking });
        });
    }

    private simpleFallback(text: string, maxLength: number = 50): string {
        const cleaned = text.replace(/[\r\n]+/g, ' ').trim();
        if (cleaned.length <= maxLength) { return cleaned; }
        // Try to cut at a sentence boundary first
        const sentenceEnd = cleaned.search(/[。！？!?.]/);
        if (sentenceEnd > 0 && sentenceEnd <= maxLength) {
            return cleaned.substring(0, sentenceEnd + 1).trim();
        }
        // Otherwise cut at last space/word boundary before maxLength
        const cut = cleaned.lastIndexOf(' ', maxLength);
        return (cut > 0 ? cleaned.substring(0, cut) : cleaned.substring(0, maxLength)) + '...';
    }

    /**
     * 清理生成的標題
     */
    private cleanTitle(title: string): string {
        return title
            .replace(/^(標題[:：]|Title[:：]|Summary[:：])/i, '')
            .replace(/```[\w]*\s*/g, '')
            .replace(/```/g, '')
            .replace(/^["「『]|["」』]$/g, '')
            .replace(/[\r\n]+/g, ' ')
            .trim();
    }

    // ──────────────────────────────────────────────────────────
    // Content classification (regex-based, no AI needed)
    // ──────────────────────────────────────────────────────────

    /**
     * 分類內容類型
     */
    classify(text: string): ContentClassification {
        const trimmed = text.trim();
        if (this.isJSON(trimmed)) return { type: 'json' };
        if (this.isMarkdown(trimmed)) return { type: 'markdown' };
        const codeResult = this.detectCode(trimmed);
        if (codeResult) return codeResult;
        return { type: 'text' };
    }

    private isJSON(text: string): boolean {
        try {
            JSON.parse(text);
            return text.startsWith('{') || text.startsWith('[');
        } catch { return false; }
    }

    private isMarkdown(text: string): boolean {
        const patterns = [
            /^#{1,6}\s+/m, /^\*\*.*\*\*/m, /^\s*[-*+]\s+/m,
            /^\s*\d+\.\s+/m, /^\s*```/m, /\[.*\]\(.*\)/
        ];
        return patterns.some(p => p.test(text));
    }

    private detectCode(text: string): ContentClassification | null {
        const languagePatterns: Record<string, RegExp[]> = {
            'javascript': [/\b(const|let|var|function|=>|async|await)\b/],
            'typescript': [/\b(interface|type|enum)\s+\w+/, /:\s*(string|number|boolean|any)\b/],
            'python': [/\b(def|class|import|from|if __name__)\b/, /^\s*@\w+/m],
            'java': [/\b(public|private|protected)\s+(class|interface|void|static)\b/],
            'html': [/^\s*<(!DOCTYPE|html|head|body|div)\b/im],
            'css': [/^\s*[.#]?\w+\s*\{/m],
            'sql': [/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i],
        };

        for (const [language, patterns] of Object.entries(languagePatterns)) {
            if (patterns.some(p => p.test(text))) {
                return { type: 'code', language };
            }
        }
        return null;
    }

    // ──────────────────────────────────────────────────────────
    // Cache & lifecycle
    // ──────────────────────────────────────────────────────────

    /**
     * 清除本機 Qwen 模型快取
     */
    async clearModelCache(): Promise<void> {
        try {
            const cacheDir = vscode.Uri.joinPath(
                vscode.Uri.file(process.env.HOME || process.env.USERPROFILE || ''),
                '.cache',
                'quickprompt-models'
            );
            await vscode.workspace.fs.delete(cacheDir, { recursive: true, useTrash: false });

            this.status = 'uninitialized';
            this.initPromise = null;

            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }

            console.log('[AIEngine] Qwen model cache cleared');
        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                return;
            }
            throw error;
        }
    }

    /**
     * 釋放資源
     */
    dispose(): void {
        for (const req of this.pendingRequests.values()) {
            req.reject(new Error('AIEngine disposed'));
        }
        this.pendingRequests.clear();

        if (this.worker) {
            this.worker.postMessage({ command: 'dispose' });
            this.worker.terminate();
            this.worker = null;
        }

        this.openAIClient = null;
        this.status = 'uninitialized';
        this.provider = 'none';
        this.initPromise = null;
        // Do not set AIEngine.instance = null to preserve the singleton and allow re-init without losing references in other components.
    }
}
