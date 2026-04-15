import * as vscode from 'vscode';
import { AIEngine } from '../ai/aiEngine';
import { generateAutoTitle } from '../utils/promptUtils';

export interface TitleGenerationResult {
    fallbackTitle: string;
    aiTitle?: string;
    source: 'fallback' | 'ai';
    generationTime?: number;
}

/**
 * 標題生成服務
 * 提供漸進式標題生成功能: Fallback 優先 + 背景 AI 非同步生成
 */
export class TitleGenerationService {
    private aiEngine: AIEngine;

    constructor(aiEngine: AIEngine) {
        this.aiEngine = aiEngine;
    }

    /**
     * 漸進式生成標題
     * @param content 內容
     * @param onAIComplete AI 完成時的回調 (aiTitle, fallbackTitle)
     * @returns 立即返回 Fallback 標題
     */
    async generateProgressively(
        content: string,
        onAIComplete?: (aiTitle: string, fallbackTitle: string) => void
    ): Promise<TitleGenerationResult> {
        // 1. 立即生成 Fallback
        const fallbackTitle = generateAutoTitle(content);

        // 2. 檢查是否啟用 AI 與標題生成功能
        const aiEnabled = vscode.workspace.getConfiguration('quickPrompt.ai').get<boolean>('enabled', false);
        const featureEnabled = vscode.workspace.getConfiguration('quickPrompt.ai.features').get<boolean>('titleGeneration', true);
        const useAI = aiEnabled && featureEnabled && this.aiEngine.isReady();

        if (!useAI) {
            console.log('[TitleGen] AI 未啟用，使用 Fallback');
            return {
                fallbackTitle,
                source: 'fallback'
            };
        }

        // 3. 背景非同步生成 AI 標題
        this.generateAITitleInBackground(content, fallbackTitle, onAIComplete);

        // 4. 立即返回 Fallback
        return {
            fallbackTitle,
            source: 'fallback'
        };
    }

    /**
     * 背景生成 AI 標題
     */
    private async generateAITitleInBackground(
        content: string,
        fallbackTitle: string,
        onComplete?: (aiTitle: string, fallbackTitle: string) => void
    ): Promise<void> {
        // 強制讓步 Event Loop，確保 UI 有足夠時間更新
        // 這解決了即便是 async 函數，若同步運算過重仍會阻塞 UI 的問題
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const startTime = Date.now();
            const aiTitle = await this.aiEngine.summarize(content, 50);
            const generationTime = Date.now() - startTime;

            console.log(`[TitleGen] AI 生成完成: "${aiTitle}" (耗時 ${generationTime}ms)`);

            // 品質檢查: 如果 AI 標題與 Fallback 相同或更差，則不回調
            if (aiTitle === fallbackTitle || aiTitle.length < 3) {
                console.log('[TitleGen] AI 標題品質不佳，保留 Fallback');
                return;
            }

            // 回調通知 UI 更新
            if (onComplete) {
                onComplete(aiTitle, fallbackTitle);
            }

        } catch (error) {
            console.error('[TitleGen] AI 生成失敗:', error);
            // 靜默失敗，使用者已有 Fallback 標題
        }
    }
}
