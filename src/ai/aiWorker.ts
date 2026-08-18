import { parentPort } from 'worker_threads';

// Global variables
let generator: any = null;
let status = 'uninitialized';

// Model registry
const MODEL_CONFIGS: Record<string, { id: string; label: string }> = {
    'smollm2-135m': { id: 'HuggingFaceTB/SmolLM2-135M-Instruct', label: 'SmolLM2-135M' },
    'smollm2-360m': { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', label: 'SmolLM2-360M' },
    'qwen3-0.6b':   { id: 'onnx-community/Qwen3-0.6B-ONNX',       label: 'Qwen3-0.6B'  },
};

if (!parentPort) {
    throw new Error('This module must be run as a worker thread');
}

// Handle messages from the main thread
parentPort.on('message', async (message: any) => {
    try {
        switch (message.command) {
            case 'init':
                await initialize(message.cacheDir, message.modelKey);
                break;
            case 'summarize':
                await summarize(message.text, message.maxLength, message.requestId, message.thinking ?? false);
                break;
            case 'dispose':
                process.exit(0);
            default:
                console.warn('[AI Worker] Unknown command:', message.command);
        }
    } catch (error: any) {
        parentPort?.postMessage({
            type: 'error',
            error: error.message || String(error),
            ...(message.requestId !== undefined && { requestId: message.requestId })
        });
    }
});

/**
 * Initialize the AI model
 */
async function initialize(cacheDir?: string, modelKey: string = 'smollm2-360m') {
    if (status === 'ready') {
        parentPort?.postMessage({ type: 'status', status: 'ready' });
        return;
    }

    const modelConfig = MODEL_CONFIGS[modelKey] ?? MODEL_CONFIGS['smollm2-360m'];

    try {
        status = 'initializing';
        parentPort?.postMessage({ type: 'status', status: 'initializing' });

        // Import transformers dynamically
        const { pipeline, env } = await import('@huggingface/transformers');

        // Set cache directory
        if (cacheDir) {
            env.cacheDir = cacheDir;
        }

        // Initialize pipeline
        generator = await pipeline(
            'text-generation',
            modelConfig.id,
            {
                dtype: 'q8',
                progress_callback: (data: any) => {
                    if (data.status === 'progress') {
                        // Normalize progress 0-100
                        let percent: number;
                        if (data.progress > 1) {
                            percent = Math.round(data.progress);
                        } else {
                            percent = Math.round((data.progress || 0) * 100);
                        }

                        parentPort?.postMessage({
                            type: 'progress',
                            message: `Downloading ${modelConfig.label}: ${percent}%`,
                            progress: data.progress
                        });
                    }
                }
            }
        );

        status = 'ready';
        parentPort?.postMessage({ type: 'status', status: 'ready' });
        // console.log('[AI Worker] Model initialized successfully');

    } catch (error) {
        status = 'error';
        throw error;
    }
}

/**
 * Generate summary
 */
async function summarize(text: string, maxLength: number = 50, requestId: number, thinking: boolean = false) {
    if (!generator) {
        throw new Error('AI model not initialized');
    }

    try {
        // Truncate input to avoid context limit
        const truncatedInput = text.length > 2000 ? text.substring(0, 2000) + '...' : text;
        const prompt = buildSummarizePrompt(truncatedInput, thinking);

        const result = await generator(prompt, thinking ? {
            max_new_tokens: 500,
            do_sample: true,
            temperature: 0.6,
            top_p: 0.95,
            top_k: 20,
            return_full_text: false,
        } : {
            max_new_tokens: 150,
            do_sample: false,
            repetition_penalty: 1.3,
            return_full_text: false,
        });

        const generatedText = result[0]?.generated_text?.trim() || '';
        const title = cleanGeneratedTitle(generatedText, maxLength);

        parentPort?.postMessage({
            type: 'result',
            requestId: requestId,
            title: title
        });

    } catch (error) {
        throw error;
    }
}

/**
 * Build ChatML prompt
 */
function buildSummarizePrompt(text: string, thinking: boolean = false): string {
    // When thinking is off, pre-fill an empty <think> block — official Qwen3 way to skip reasoning
    const assistantPrefix = thinking ? '' : '<think>\n\n</think>\n\n';
    return `<|im_start|>system
You are a title generator. Write a concise title (under 50 characters) for the content below. Use the same language as the content. Output only the title, with no explanation or prefix.<|im_end|>
<|im_start|>user
${text}<|im_end|>
<|im_start|>assistant
${assistantPrefix}`;
}

/**
 * Clean generated title
 */
function cleanGeneratedTitle(title: string, maxLength: number = 50): string {
    return title
        .replace(/<think>[\s\S]*?<\/think>/g, '')  // strip Qwen3 full thinking blocks
        .replace(/^[\s\S]*?<\/think>\s*/s, '')      // strip orphan </think> (thinking cut off)
        .replace(/^(Title[:：]|标题[:：]|標題[:：]|Summary[:：])\s*/i, '')
        .replace(/```[\w]*\s*/g, '')
        .replace(/```/g, '')
        .replace(/^["「『【]|["」』】]$/g, '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .substring(0, maxLength);
}
