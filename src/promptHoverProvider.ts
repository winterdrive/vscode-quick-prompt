import * as vscode from 'vscode';
import { Prompt } from './promptProvider';
import { ClipboardHistoryItem } from './ClipboardManager';
import { I18n } from './i18n';
import { formatRelativeTime, PROMPT_CONSTANTS } from './utils';

/**
 * Prompt Hover Provider
 * 為虛擬檔案系統中的 Prompt 提供豐富的懸停預覽
 */
export class PromptHoverProvider implements vscode.HoverProvider {
    private prompts: Map<string, Prompt> = new Map();
    private clipboardHistory: Map<string, ClipboardHistoryItem> = new Map();

    /**
     * 更新 Prompts 資料
     */
    updatePrompts(prompts: Prompt[]) {
        this.prompts.clear();
        prompts.forEach(p => this.prompts.set(p.id, p));
    }

    /**
     * 更新剪貼簿歷史資料
     */
    updateClipboardHistory(history: ClipboardHistoryItem[]) {
        this.clipboardHistory.clear();
        history.forEach(item => this.clipboardHistory.set(item.id, item));
    }

    /**
     * 提供懸停資訊
     */
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // 檢查是否為虛擬檔案系統
        if (document.uri.scheme !== 'quickprompt') {
            return null;
        }

        // 從 URI 中提取 Prompt ID（虛擬路徑格式為 /<workspaceKey>/<actualId>.md 或 /<actualId>.md）
        const cleanPath = document.uri.path.replace(/\.md$/, '');
        const parts = cleanPath.substring(1).split('/').map(decodeURIComponent);
        if (parts.length === 0 || !parts[0]) {
            return null;
        }

        const promptId = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0];
        const prompt = this.prompts.get(promptId);

        if (!prompt) {
            return null;
        }

        // 建立 Markdown 格式的懸停內容
        const markdown = this.createPromptHoverMarkdown(prompt);
        return new vscode.Hover(markdown);
    }

    /**
     * 建立 Prompt 的懸停 Markdown
     */
    private createPromptHoverMarkdown(prompt: Prompt): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        // isTrusted intentionally left false: prompt title/content is user-controlled
        // (and may come from a shared, version-controlled prompts.json), and isTrusted
        // would let a crafted `[label](command:...)` markdown link execute VS Code
        // commands. Nothing here needs command links.

        // 標題
        md.appendMarkdown(`## ${prompt.pinned ? '📌 ' : ''}${prompt.title}\n\n`);

        // 分隔線
        md.appendMarkdown(`---\n\n`);

        // 統計資訊
        const stats: string[] = [];

        // 使用次數（帶圖示）
        if (prompt.use_count >= 10) {
            stats.push(`🔥 **${I18n.getMessage('status.useCount', prompt.use_count.toString())}**`);
        } else if (prompt.use_count >= 5) {
            stats.push(`⭐ **${I18n.getMessage('status.useCount', prompt.use_count.toString())}**`);
        } else if (prompt.use_count > 0) {
            stats.push(`📝 ${I18n.getMessage('status.useCount', prompt.use_count.toString())}`);
        } else {
            stats.push(`⚪ ${I18n.getMessage('time.never')}`);
        }

        // 最後使用時間
        const lastUsedText = formatRelativeTime(prompt.last_used);
        stats.push(`📅 ${I18n.getMessage('status.lastUsed', lastUsedText)}`);

        // 建立時間
        const createdText = formatRelativeTime(prompt.created_at);
        stats.push(`📅 ${I18n.getMessage('status.created', createdText)}`);

        md.appendMarkdown(stats.join(' • ') + '\n\n');

        // 分隔線
        md.appendMarkdown(`---\n\n`);

        // 內容預覽
        const preview = prompt.content.length > PROMPT_CONSTANTS.PREVIEW_MAX_LENGTH
            ? prompt.content.substring(0, PROMPT_CONSTANTS.PREVIEW_MAX_LENGTH) + '...'
            : prompt.content;
        md.appendMarkdown(`### 📄 Preview\n\n`);
        md.appendMarkdown(`\`\`\`\n${preview}\n\`\`\`\n\n`);

        // 快速操作提示
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`💡 **Quick Actions**: `);
        md.appendMarkdown(`Copy • Edit • Pin • Delete\n`);

        return md;
    }

}
