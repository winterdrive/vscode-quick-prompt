/**
 * Privacy Masking Preview WebView
 * Displays before/after comparison with interactive unmask
 * Quick Prompt v0.3.0 - Privacy Protection
 */

import * as vscode from 'vscode';
import { MaskingResult, MaskToken, MaskType } from '../privacy/types';
import { MaskingEngine } from '../privacy/maskingEngine';

/**
 * 遮罩類型顏色映射
 */
const MASK_TYPE_COLORS: Record<string, string> = {
    'EMAIL': '#ff6b6b',           // 紅色 - Email
    'PHONE': '#4ecdc4',           // 青色 - 電話
    'API_KEY': '#95e1d3',         // 淺青 - API Key
    'CREDIT_CARD': '#f38181',     // 粉紅 - 信用卡
    'IP_ADDRESS': '#aa96da',      // 紫色 - IP
    'PERSON': '#fcbf49',          // 黃色 - 人名
    'ORGANIZATION': '#f77f00',    // 橘色 - 組織
    'LOCATION': '#06d6a0',        // 綠色 - 地點
    'CUSTOM': '#457b9d',          // 藍色 - 自訂
    'DEFAULT': '#adb5bd'          // 灰色 - 預設
};

/**
 * 遮罩類型顯示名稱
 */
const MASK_TYPE_LABELS: Record<string, string> = {
    'EMAIL': 'Email',
    'PHONE': 'Phone',
    'SSN': 'SSN',
    'API_KEY': 'API Key',
    'AWS_KEY': 'AWS Key',
    'GITHUB_TOKEN': 'GitHub Token',
    'OPENAI_KEY': 'OpenAI Key',
    'CREDIT_CARD': 'Credit Card',
    'IP_ADDRESS': 'IP Address',
    'PERSON': 'Person Name',
    'ORGANIZATION': 'Organization',
    'LOCATION': 'Location',
    'CUSTOM': 'Custom',
    'MISC': 'Miscellaneous'
};

/**
 * Privacy Preview WebView Provider
 */
export class PrivacyPreviewPanel {
    public static currentPanel: PrivacyPreviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private readonly maskingEngine: MaskingEngine;
    private disposables: vscode.Disposable[] = [];
    private currentResult: MaskingResult | null = null;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        maskingEngine: MaskingEngine
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.maskingEngine = maskingEngine;

        // 設定初始內容
        this.update();

        // 監聽面板關閉
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // 監聽來自 WebView 的訊息
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );
    }

    /**
     * 建立或顯示預覽面板
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        maskingEngine: MaskingEngine
    ): PrivacyPreviewPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 如果已存在面板，直接顯示
        if (PrivacyPreviewPanel.currentPanel) {
            PrivacyPreviewPanel.currentPanel.panel.reveal(column);
            return PrivacyPreviewPanel.currentPanel;
        }

        // 創建新面板
        const panel = vscode.window.createWebviewPanel(
            'privacyPreview',
            'Privacy Masking Preview',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        PrivacyPreviewPanel.currentPanel = new PrivacyPreviewPanel(
            panel,
            extensionUri,
            maskingEngine
        );

        return PrivacyPreviewPanel.currentPanel;
    }

    /**
     * 更新預覽內容
     */
    public async updatePreview(result: MaskingResult): Promise<void> {
        this.currentResult = result;
        this.update();
    }

    /**
     * 處理來自 WebView 的訊息
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'unmask':
                await this.handleUnmask(message.tokenId);
                break;
            case 'unmaskBatch':
                await this.handleUnmaskBatch(message.tokenIds, message.count);
                break;
            case 'unmaskAll':
                await this.handleUnmaskAll(message.tokenIds, message.count);
                break;
            case 'export':
                await this.handleExport(message.format);
                break;
            case 'copyOriginal':
                await this.handleCopyOriginal();
                break;
            case 'copyMasked':
                await this.handleCopyMasked();
                break;
            case 'refresh':
                this.update();
                break;
        }
    }

    /**
     * 解除單個遮罩（增強安全提示）
     */
    private async handleUnmask(tokenId: string): Promise<void> {
        if (!this.currentResult) {
            return;
        }

        const token = this.currentResult.tokens.find(t => t.id === tokenId);
        if (!token) {
            return;
        }

        // 檢查工作區信任狀態
        const isTrusted = vscode.workspace.isTrusted;
        
        // 增強的安全確認對話框
        const riskLevel = this.getTokenRiskLevel(token.type);
        const confirm = await vscode.window.showWarningMessage(
            `⚠️ Security Warning: Revealing Sensitive Information\n\nToken Type: ${token.type}\nRisk Level: ${riskLevel}\nWorkspace Trust: ${isTrusted ? '✅ Trusted' : '❌ NOT TRUSTED'}\n\nAre you sure you want to reveal "${token.maskedValue}"?`,
            { 
                modal: true,
                detail: isTrusted 
                    ? 'This action will expose the original value. Make sure your screen is not being recorded or shared.'
                    : '⚠️ WARNING: This workspace is NOT TRUSTED. Revealing sensitive data in untrusted workspaces may expose it to malicious code.'
            },
            'Yes, Reveal',
            'Cancel'
        );

        if (confirm === 'Yes, Reveal') {
            // 傳送原始值回 WebView
            this.panel.webview.postMessage({
                command: 'revealToken',
                tokenId: tokenId,
                originalValue: token.originalValue
            });
        }
    }

    /**
     * 批次解除遮罩
     */
    private async handleUnmaskBatch(tokenIds: string[], count: number): Promise<void> {
        if (!this.currentResult || !tokenIds || tokenIds.length === 0) {
            return;
        }

        // 檢查工作區信任狀態
        const isTrusted = vscode.workspace.isTrusted;

        // 統計類型分佈
        const tokens = tokenIds.map(id => this.currentResult!.tokens.find(t => t.id === id)).filter(t => t);
        const typeDistribution = this.getTypeDistribution(tokens as any[]);

        // 批次確認對話框
        const confirm = await vscode.window.showWarningMessage(
            `⚠️ Security Warning: Revealing ${count} Masked Items\n\nTypes: ${typeDistribution}\nWorkspace Trust: ${isTrusted ? '✅ Trusted' : '❌ NOT TRUSTED'}\n\nAre you sure you want to reveal ${count} selected items?`,
            {
                modal: true,
                detail: isTrusted
                    ? 'This will expose multiple sensitive values at once. Ensure your screen is secure.'
                    : '⚠️ CRITICAL: Workspace is NOT TRUSTED. Batch revealing in untrusted environments is highly risky!'
            },
            'Yes, Reveal All Selected',
            'Cancel'
        );

        if (confirm === 'Yes, Reveal All Selected') {
            const tokensData = tokenIds.map(id => {
                const token = this.currentResult!.tokens.find(t => t.id === id);
                return token ? { tokenId: id, originalValue: token.originalValue } : null;
            }).filter(t => t);

            this.panel.webview.postMessage({
                command: 'revealAll',
                tokens: tokensData
            });
        }
    }

    /**
     * 計算字元數縮減百分比
     */
    private calculateReduction(original: number, masked: number): string {
        if (original === 0) {
            return '0.0';
        }
        const reduction = ((original - masked) / original) * 100;
        return reduction.toFixed(1);
    }

    /**
     * 解除所有遮罩（增強安全提示）
     */
    private async handleUnmaskAll(tokenIds: string[], count: number): Promise<void> {
        if (!this.currentResult) {
            return;
        }

        // 檢查工作區信任狀態
        const isTrusted = vscode.workspace.isTrusted;
        
        // 統計類型分佈
        const typeDistribution = this.getTypeDistribution(this.currentResult.tokens);

        // 嚴厲的全部揭露確認
        const confirm = await vscode.window.showWarningMessage(
            `🚨 CRITICAL WARNING: Revealing ALL ${count} Masked Items!\n\nTypes: ${typeDistribution}\nWorkspace Trust: ${isTrusted ? '✅ Trusted' : '❌ NOT TRUSTED'}\n\nThis will expose ALL sensitive information at once!`,
            {
                modal: true,
                detail: isTrusted
                    ? 'Are you absolutely sure? This action will reveal all masked values including emails, API keys, passwords, and personal information.'
                    : '🚨 EXTREME RISK: Workspace is NOT TRUSTED!\n\nRevealing all sensitive data in an untrusted workspace could lead to:\n• Data theft by malicious extensions\n• Credential exposure\n• Privacy violations\n\nWe STRONGLY recommend against this action.'
            },
            'I Understand the Risks, Reveal All',
            'Cancel'
        );

        if (confirm === 'I Understand the Risks, Reveal All') {
            const tokensData = this.currentResult.tokens.map(token => ({
                tokenId: token.id,
                originalValue: token.originalValue
            }));

            this.panel.webview.postMessage({
                command: 'revealAll',
                tokens: tokensData
            });
        }
    }

    /**
     * 獲取 Token 風險等級
     */
    private getTokenRiskLevel(type: string): string {
        const highRisk = ['API_KEY', 'AWS_KEY', 'GITHUB_TOKEN', 'OPENAI_KEY', 'CREDIT_CARD', 'SSN', 'PRIVATE_KEY'];
        const mediumRisk = ['EMAIL', 'PHONE', 'IP_ADDRESS'];
        
        if (highRisk.includes(type)) {
            return '🔴 HIGH (Credentials/Secrets)';
        } else if (mediumRisk.includes(type)) {
            return '🟡 MEDIUM (Personal Info)';
        } else {
            return '🟢 LOW (General Data)';
        }
    }

    /**
     * 獲取類型分佈摘要
     */
    private getTypeDistribution(tokens: MaskToken[]): string {
        const typeCounts = new Map<string, number>();
        tokens.forEach(token => {
            typeCounts.set(token.type, (typeCounts.get(token.type) || 0) + 1);
        });

        return Array.from(typeCounts.entries())
            .map(([type, count]) => `${type}(${count})`)
            .join(', ');
    }

    /**
     * 匯出遮罩報告
     */
    private async handleExport(format: 'json' | 'csv'): Promise<void> {
        if (!this.currentResult) {
            return;
        }

        const result = this.currentResult;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `privacy-masking-report-${timestamp}.${format}`;

        let content: string;
        
        if (format === 'json') {
            // JSON 格式：完整報告
            const report = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    totalTokens: result.tokens.length,
                    processingTime: result.processingTime,
                    strategies: result.strategies,
                    statistics: {
                        originalLength: result.originalText.length,
                        maskedLength: result.maskedText.length,
                        reduction: this.calculateReduction(result.originalText.length, result.maskedText.length) + '%'
                    }
                },
                tokens: result.tokens.map(token => ({
                    id: token.id,
                    type: token.type,
                    maskedValue: token.maskedValue,
                    confidence: token.confidence || 1.0,
                    startPos: token.startPos,
                    endPos: token.endPos
                })),
                typeDistribution: this.getTypeDistributionStats(result.tokens),
                maskedText: result.maskedText
            };
            content = JSON.stringify(report, null, 2);
        } else {
            // CSV 格式：表格數據
            const headers = ['ID', 'Type', 'Masked Value', 'Confidence', 'Start', 'End'];
            const rows = result.tokens.map(token => [
                token.id,
                token.type,
                token.maskedValue,
                (token.confidence || 1.0).toFixed(2),
                (token.startPos || 0).toString(),
                (token.endPos || 0).toString()
            ]);
            
            content = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');
        }

        // 儲存檔案
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(filename),
            filters: format === 'json'
                ? { 'JSON Files': ['json'], 'All Files': ['*'] }
                : { 'CSV Files': ['csv'], 'All Files': ['*'] }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
            vscode.window.showInformationMessage(`✅ Report exported: ${uri.fsPath}`);
        }
    }

    /**
     * 獲取詳細類型分佈統計
     */
    private getTypeDistributionStats(tokens: MaskToken[]): Record<string, number> {
        const stats: Record<string, number> = {};
        tokens.forEach(token => {
            stats[token.type] = (stats[token.type] || 0) + 1;
        });
        return stats;
    }

    /**
     * 複製原始文本
     */
    private async handleCopyOriginal(): Promise<void> {
        if (this.currentResult) {
            await vscode.env.clipboard.writeText(this.currentResult.originalText);
            vscode.window.showInformationMessage('Original text copied to clipboard');
        }
    }

    /**
     * 複製遮罩文本
     */
    private async handleCopyMasked(): Promise<void> {
        if (this.currentResult) {
            await vscode.env.clipboard.writeText(this.currentResult.maskedText);
            vscode.window.showInformationMessage('Masked text copied to clipboard');
        }
    }

    /**
     * 更新 WebView HTML
     */
    private update(): void {
        this.panel.webview.html = this.getHtmlContent();
    }

    /**
     * 生成 HTML 內容
     */
    private getHtmlContent(): string {
        if (!this.currentResult) {
            return this.getWelcomeHTML();
        }

        const result = this.currentResult;
        
        // 統計各類型數量
        const typeStats = this.getTypeStatistics(result.tokens);
        const inlineSummary = this.generateInlineSummary(typeStats, result);
        const tokensTableHTML = this.generateTokensTable(result.tokens);
        const maskedTextHTML = this.highlightMaskedText(result.maskedText, result.tokens);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Masking Preview</title>
    <style>
        ${this.getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="header-content">
                <h1>Privacy Masking Preview</h1>
                ${inlineSummary}
            </div>
            <div class="actions">
                <button id="btnCopyMasked" class="btn btn-primary" aria-label="Copy masked text to clipboard">
                    <span class="icon">📋</span> Copy Masked
                </button>
                <button id="btnCopyOriginal" class="btn btn-secondary" aria-label="Copy original text to clipboard">
                    <span class="icon">📄</span> Copy Original
                </button>
                <div class="export-group">
                    <select class="export-format" id="exportFormat" aria-label="Export format">
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                    </select>
                    <button id="btnExport" class="btn btn-export" aria-label="Export masking report">
                        <span class="icon">📊</span> Export
                    </button>
                </div>
            </div>
        </header>

        <section class="tokens-section">
            <div class="section-header">
                <h2>Masked Tokens (${result.tokens.length})</h2>
                <div class="toolbar">
                    <input type="text" id="searchInput" placeholder="Search tokens..." 
                           class="search-input" aria-label="Search tokens"/>
                    <select id="filterType" class="filter-select" aria-label="Filter by type">
                        <option value="">All Types</option>
                        ${this.generateFilterOptions(typeStats)}
                    </select>
                </div>
            </div>
            <div class="batch-controls">
                <button id="btnRevealSelected" class="btn btn-primary" aria-label="Reveal selected masked values" disabled>
                    <span class="icon">👁️</span> Reveal Selected (<span id="selectedCount">0</span>)
                </button>
                <button id="btnRevealAll" class="btn btn-warning" aria-label="Reveal all masked values">
                    <span class="icon">👁️</span> Reveal All
                </button>
                <button id="btnResetAll" class="btn btn-secondary" aria-label="Hide all revealed values" style="display:none">
                    <span class="icon">🔒</span> Reset All
                </button>
            </div>
            ${tokensTableHTML}
        </section>

        ${this.generateStatsSection(typeStats)}

        <section class="preview-section">
            <h2>Masked Text Preview</h2>
            <div class="text-preview masked" role="region" aria-label="Masked text content">
                ${maskedTextHTML}
            </div>
        </section>
    </div>

    <script>
        ${this.getScript()}
    </script>
</body>
</html>`;
    }

    /**
     * 生成歡迎頁面 HTML
     */
    private getWelcomeHTML(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Masking Preview</title>
    <style>${this.getStyles()}</style>
</head>
<body>
    <div class="container welcome">
        <div class="welcome-content">
            <h1>🔒 Privacy Masking Preview</h1>
            <p>No preview available yet.</p>
            <p>Use <strong>Quick Prompt: Preview Privacy Masking</strong> command to start.</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * 生成 Inline Summary（取代大卡片）
     */
    private generateInlineSummary(typeStats: Map<string, number>, result: MaskingResult): string {
        const statsItems = Array.from(typeStats.entries())
            .map(([type, count]) => {
                const color = MASK_TYPE_COLORS[type] || MASK_TYPE_COLORS['DEFAULT'];
                const label = MASK_TYPE_LABELS[type] || type;
                return `<span class="badge" style="--badge-color: ${color}" title="${label}">${count}</span>`;
            })
            .join('');

        const strategies = result.strategies.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' + ');
        
        return `
        <div class="inline-summary">
            <div class="summary-item">
                <span class="summary-label">Found:</span>
                <span class="summary-value">${result.tokens.length} items</span>
            </div>
            <div class="summary-badges">
                ${statsItems}
            </div>
            <details class="summary-details">
                <summary>Technical Details</summary>
                <div class="details-content">
                    <div class="summary-item">
                        <span class="summary-label">Characters:</span>
                        <span class="summary-value">${result.originalText.length} → ${result.maskedText.length}</span>
                        <span class="summary-label" style="opacity: 0.5; margin-left: 4px;">(${this.calculateReduction(result.originalText.length, result.maskedText.length)}% reduction)</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Strategy:</span>
                        <span class="summary-value">${strategies}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Processing Time:</span>
                        <span class="summary-value">${result.processingTime}ms</span>
                    </div>
                </div>
            </details>
        </div>
        `;
    }

    /**
     * 生成 Filter Options
     */
    private generateFilterOptions(typeStats: Map<string, number>): string {
        return Array.from(typeStats.keys())
            .map(type => {
                const label = MASK_TYPE_LABELS[type] || type;
                const count = typeStats.get(type) || 0;
                return `<option value="${type}">${label} (${count})</option>`;
            })
            .join('');
    }

    /**
     * 生成類型分佈統計區域
     */
    private generateStatsSection(typeStats: Map<string, number>): string {
        const totalCount = Array.from(typeStats.values()).reduce((sum, count) => sum + count, 0);
        
        const statBars = Array.from(typeStats.entries())
            .sort((a, b) => b[1] - a[1]) // 按數量排序
            .map(([type, count]) => {
                const label = MASK_TYPE_LABELS[type] || type;
                const color = MASK_TYPE_COLORS[type] || MASK_TYPE_COLORS['DEFAULT'];
                const percentage = (count / totalCount * 100).toFixed(1);
                
                return `
                    <div class="stat-bar">
                        <div class="stat-label">${label}</div>
                        <div class="stat-progress">
                            <div class="stat-fill" style="width: ${percentage}%; --badge-color: ${color}">
                                ${percentage}%
                            </div>
                        </div>
                        <div class="stat-count">${count}</div>
                    </div>
                `;
            })
            .join('');
        
        return `
        <section class="stats-section">
            <h2>📊 Type Distribution</h2>
            <div class="stats-chart">
                ${statBars}
            </div>
        </section>
        `;
    }

    /**
     * 生成 Tokens Table（取代卡片網格）
     */
    private generateTokensTable(tokens: MaskToken[]): string {
        const rows = tokens.map((token, index) => {
            const color = MASK_TYPE_COLORS[token.type] || MASK_TYPE_COLORS['DEFAULT'];
            const label = MASK_TYPE_LABELS[token.type] || token.type;
            const confidence = token.confidence ? `${(token.confidence * 100).toFixed(0)}%` : 'N/A';
            
            return `
                <tr class="token-row" data-token-id="${token.id}" data-token-type="${token.type}" tabindex="0" 
                    role="row" aria-label="Token ${index + 1}: ${label}">
                    <td class="col-checkbox">
                        <input type="checkbox" class="token-checkbox" data-token-id="${token.id}" 
                               aria-label="Select token ${index + 1}" />
                    </td>
                    <td class="col-index">${index + 1}</td>
                    <td class="col-type">
                        <span class="type-badge" style="--badge-color: ${color}">${label}</span>
                    </td>
                    <td class="col-masked">
                        <code>${this.escapeHtml(token.maskedValue)}</code>
                    </td>
                    <td class="col-original">
                        <code class="original-value hidden" data-original="${this.escapeHtml(token.originalValue)}">
                            <span class="hidden-indicator">🔒 [Hidden]</span>
                        </code>
                    </td>
                    <td class="col-confidence">${confidence}</td>
                    <td class="col-actions">
                        <button class="btn-reveal" data-token-id="${token.id}" 
                                aria-label="Reveal original value" title="Reveal (Enter)">
                            👁️
                        </button>
                        <button class="btn-hide" data-token-id="${token.id}" 
                                aria-label="Hide original value" title="Hide" style="display:none">
                            🔒
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
        <div class="table-container">
            <table class="tokens-table" role="table" aria-label="Masked tokens list">
                <thead>
                    <tr role="row">
                        <th class="col-checkbox" role="columnheader">
                            <div class="checkbox-header">
                                <input type="checkbox" id="selectAll" aria-label="Select all tokens" />
                                <span class="checkbox-label">Select</span>
                            </div>
                        </th>
                        <th class="col-index" role="columnheader">#</th>
                        <th class="col-type" role="columnheader">Type</th>
                        <th class="col-masked" role="columnheader">Masked Value</th>
                        <th class="col-original" role="columnheader">Original Value</th>
                        <th class="col-confidence" role="columnheader">Confidence</th>
                        <th class="col-actions" role="columnheader">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
        `;
    }

    /**
     * 高亮遮罩文本
     */
    private highlightMaskedText(text: string, tokens: MaskToken[]): string {
        let highlighted = this.escapeHtml(text);
        
        tokens.forEach(token => {
            const color = MASK_TYPE_COLORS[token.type] || MASK_TYPE_COLORS['DEFAULT'];
            const masked = this.escapeHtml(token.maskedValue);
            highlighted = highlighted.replace(
                masked,
                `<span class="highlight" style="background-color: ${color}20; border-color: ${color}">${masked}</span>`
            );
        });

        return highlighted;
    }

    /**
     * 統計各類型數量
     */
    private getTypeStatistics(tokens: MaskToken[]): Map<string, number> {
        const stats = new Map<string, number>();
        
        tokens.forEach(token => {
            const type = token.type;
            stats.set(type, (stats.get(type) || 0) + 1);
        });

        return stats;
    }

    /**
     * 取得 CSS 樣式
     */
    private getStyles(): string {
        return `
            :root {
                --primary-color: var(--vscode-button-background);
                --danger-color: #ff6b6b;
                --warning-color: #f39c12;
                --success-color: #27ae60;
                --border-color: var(--vscode-panel-border);
                --hover-bg: var(--vscode-list-hoverBackground);
                --active-bg: var(--vscode-list-activeSelectionBackground);
            }

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: var(--vscode-font-family), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: var(--vscode-font-size, 14px);
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                padding: 16px;
                line-height: 1.5;
            }

            .container {
                max-width: 100%;
                margin: 0 auto;
            }

            /* ===== Header ===== */
            header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
                gap: 16px;
                flex-wrap: wrap;
            }

            .header-content {
                flex: 1;
                min-width: 300px;
            }

            h1 {
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 12px;
            }

            h2 {
                font-size: 16px;
                margin-bottom: 12px;
                font-weight: 600;
            }

            /* ===== Inline Summary ===== */
            .inline-summary {
                display: flex;
                align-items: center;
                gap: 20px;
                flex-wrap: wrap;
                font-size: 13px;
            }

            .summary-item {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .summary-label {
                opacity: 0.7;
            }

            .summary-value {
                font-weight: 600;
            }

            .summary-badges {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }

            .summary-details {
                margin-left: auto;
                font-size: 12px;
            }

            .summary-details summary {
                cursor: pointer;
                opacity: 0.7;
                user-select: none;
            }

            .summary-details summary:hover {
                opacity: 1;
            }

            .details-content {
                display: flex;
                gap: 16px;
                margin-top: 8px;
                padding: 8px;
                background: var(--vscode-input-background);
                border-radius: 4px;
            }

            .badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 24px;
                height: 24px;
                padding: 0 8px;
                border-radius: 12px;
                background: var(--badge-color);
                color: white;
                font-size: 12px;
                font-weight: 600;
            }

            /* ===== Buttons ===== */
            .actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .btn {
                padding: 6px 12px;
                border: 1px solid transparent;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                font-family: inherit;
                transition: all 0.15s ease;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
            }

            .btn:hover {
                opacity: 0.9;
            }

            .btn:focus {
                outline: 2px solid var(--vscode-focusBorder);
                outline-offset: 2px;
            }

            .btn-primary {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }

            .btn-secondary {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }

            .btn-warning {
                background: var(--warning-color);
                color: white;
            }

            .btn-reveal {
                padding: 4px 8px;
                border: none;
                background: transparent;
                color: var(--vscode-foreground);
                cursor: pointer;
                font-size: 16px;
                border-radius: 4px;
                transition: background 0.15s ease;
            }

            .btn-reveal:hover {
                background: var(--hover-bg);
            }

            .btn-reveal:focus {
                outline: 1px solid var(--vscode-focusBorder);
            }

            .btn-hide {
                padding: 4px 8px;
                border: none;
                background: transparent;
                color: var(--vscode-foreground);
                cursor: pointer;
                font-size: 16px;
                border-radius: 4px;
                transition: background 0.15s ease;
            }

            .btn-hide:hover {
                background: var(--hover-bg);
            }

            .btn-hide:focus {
                outline: 1px solid var(--vscode-focusBorder);
            }

            /* ===== Sections ===== */
            .preview-section,
            .tokens-section {
                margin-bottom: 24px;
            }

            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                gap: 16px;
                flex-wrap: wrap;
            }

            .toolbar {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                align-items: center;
            }

            .batch-controls {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
                padding: 12px;
                background: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 6px;
                flex-wrap: wrap;
            }

            .batch-controls .btn {
                font-size: 12px;
                padding: 5px 10px;
            }

            .export-group {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            .export-format {
                padding: 5px 8px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-size: 12px;
                cursor: pointer;
                font-family: inherit;
            }

            .export-format:focus {
                outline: 1px solid var(--vscode-focusBorder);
            }

            .btn-export {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }
            }

            .btn-export {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }

            .search-input,
            .filter-select {
                padding: 6px 10px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-size: 13px;
                font-family: inherit;
            }

            .search-input {
                min-width: 200px;
            }

            .search-input:focus,
            .filter-select:focus {
                outline: 1px solid var(--vscode-focusBorder);
            }

            /* ===== Statistics Section ===== */
            .stats-section {
                margin: 20px 0;
            }

            .stats-chart {
                display: grid;
                gap: 8px;
                margin-top: 12px;
            }

            .stat-bar {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .stat-label {
                min-width: 120px;
                font-size: 12px;
                font-weight: 600;
            }

            .stat-progress {
                flex: 1;
                height: 24px;
                background: var(--vscode-input-background);
                border-radius: 4px;
                overflow: hidden;
                position: relative;
            }

            .stat-fill {
                height: 100%;
                background: var(--badge-color);
                transition: width 0.3s ease;
                display: flex;
                align-items: center;
                padding: 0 8px;
                color: white;
                font-size: 11px;
                font-weight: 600;
            }

            .stat-count {
                min-width: 60px;
                text-align: right;
                font-size: 13px;
                font-weight: 600;
            }

            /* ===== Text Preview ===== */
            .text-preview {
                background: var(--vscode-textCodeBlock-background);
                padding: 16px;
                border-radius: 6px;
                border: 1px solid var(--border-color);
                white-space: pre-wrap;
                word-break: break-word;
                font-family: var(--vscode-editor-font-family), 'Courier New', monospace;
                font-size: var(--vscode-editor-font-size, 14px);
                line-height: 1.6;
                max-height: 400px;
                overflow-y: auto;
            }

            .highlight {
                padding: 2px 4px;
                border-radius: 3px;
                border: 1px solid;
                font-weight: 600;
            }

            /* ===== Tokens Table ===== */
            .table-container {
                overflow-x: auto;
                border: 1px solid var(--border-color);
                border-radius: 6px;
            }

            .tokens-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }

            .tokens-table thead {
                background: var(--vscode-editor-inactiveSelectionBackground);
                position: sticky;
                top: 0;
                z-index: 10;
            }

            .tokens-table th {
                padding: 10px 12px;
                text-align: left;
                font-weight: 600;
                border-bottom: 2px solid var(--border-color);
            }

            .tokens-table td {
                padding: 10px 12px;
                border-bottom: 1px solid var(--border-color);
            }

            .token-row {
                transition: background 0.15s ease;
            }

            .token-row:hover {
                background: var(--hover-bg);
            }

            .token-row:focus {
                background: var(--active-bg);
                outline: 2px solid var(--vscode-focusBorder);
                outline-offset: -2px;
            }

            .token-row.revealed {
                background: rgba(39, 174, 96, 0.1);
            }

            .col-checkbox {
                width: 70px;
                text-align: center;
            }

            .checkbox-header {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
            }

            .checkbox-label {
                font-size: 10px;
                font-weight: 500;
                opacity: 0.7;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .col-checkbox input[type="checkbox"] {
                cursor: pointer;
                width: 16px;
                height: 16px;
            }

            .col-index {
                width: 50px;
                text-align: center;
                opacity: 0.5;
                font-size: 11px;
                font-weight: 400;
            }

            .col-type {
                width: 140px;
            }

            .col-masked {
                min-width: 200px;
            }

            .col-masked code {
                font-size: 14px;
                font-weight: 600;
                color: var(--vscode-editor-foreground);
            }

            .col-original {
                min-width: 200px;
            }

            .col-original code {
                font-size: 14px;
                font-weight: 600;
            }

            .col-confidence {
                width: 100px;
                text-align: center;
                opacity: 0.6;
                font-size: 12px;
            }

            .col-actions {
                width: 80px;
                text-align: center;
            }

            .type-badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 4px;
                background: var(--badge-color);
                color: white;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
            }

            code {
                font-family: var(--vscode-editor-font-family), 'Courier New', monospace;
                padding: 2px 4px;
                background: var(--vscode-textCodeBlock-background);
                border-radius: 3px;
            }

            .original-value.hidden {
                opacity: 0.6;
                user-select: none;
            }

            .hidden-indicator {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                color: var(--vscode-disabledForeground);
                font-style: italic;
            }

            .original-value:not(.hidden) {
                color: var(--success-color);
                font-weight: 600;
                animation: reveal-pulse 0.3s ease;
            }

            @keyframes reveal-pulse {
                0% { opacity: 0; transform: scale(0.95); }
                50% { opacity: 1; transform: scale(1.02); }
                100% { opacity: 1; transform: scale(1); }
            }

            /* ===== Welcome Page ===== */
            .welcome {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 60vh;
            }

            .welcome-content {
                text-align: center;
                max-width: 500px;
            }

            .welcome-content h1 {
                margin-bottom: 16px;
                font-size: 24px;
            }

            .welcome-content p {
                margin: 10px 0;
                opacity: 0.8;
                line-height: 1.6;
            }

            /* ===== Responsive ===== */
            @media (max-width: 768px) {
                header {
                    flex-direction: column;
                }

                .actions {
                    width: 100%;
                }

                .btn {
                    flex: 1;
                }

                .tokens-table {
                    font-size: 12px;
                }

                .tokens-table th,
                .tokens-table td {
                    padding: 8px;
                }
            }

            /* ===== Accessibility ===== */
            @media (prefers-reduced-motion: reduce) {
                * {
                    transition: none !important;
                }
            }

            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
        `;
    }

    /**
     * 取得 JavaScript 腳本
     */
    private getScript(): string {
        return `
            const vscode = acquireVsCodeApi();
            let allTokens = [];
            let selectedTokens = new Set();

            // 初始化
            function init() {
                // 綁定按鈕事件
                document.getElementById('btnCopyMasked')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'copyMasked' });
                });

                document.getElementById('btnCopyOriginal')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'copyOriginal' });
                });

                document.getElementById('btnRevealAll')?.addEventListener('click', handleRevealAll);
                document.getElementById('btnRevealSelected')?.addEventListener('click', handleRevealSelected);
                document.getElementById('btnResetAll')?.addEventListener('click', handleResetAll);
                document.getElementById('btnExport')?.addEventListener('click', handleExport);

                // 綁定 Select All checkbox
                const selectAllCheckbox = document.getElementById('selectAll');
                selectAllCheckbox?.addEventListener('change', handleSelectAll);

                // 綁定搜尋事件
                const searchInput = document.getElementById('searchInput');
                searchInput?.addEventListener('input', handleSearch);

                // 綁定篩選事件
                const filterSelect = document.getElementById('filterType');
                filterSelect?.addEventListener('change', handleFilter);

                // 綁定所有 token checkbox
                document.querySelectorAll('.token-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', handleTokenCheckboxChange);
                });

                // 綁定 Reveal 按鈕事件
                document.querySelectorAll('.btn-reveal').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const tokenId = this.getAttribute('data-token-id');
                        vscode.postMessage({ command: 'unmask', tokenId });
                    });
                });

                // 綁定 Hide 按鈕事件
                document.querySelectorAll('.btn-hide').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const tokenId = this.getAttribute('data-token-id');
                        hideToken(tokenId);
                    });
                });

                // 綁定表格行鍵盤事件
                document.querySelectorAll('.token-row').forEach(row => {
                    row.addEventListener('keydown', handleRowKeydown);
                });

                // 保存所有 tokens 以供搜尋/篩選
                allTokens = Array.from(document.querySelectorAll('.token-row'));
            }

            // 處理 Select All
            function handleSelectAll(event) {
                const isChecked = event.target.checked;
                const visibleCheckboxes = Array.from(document.querySelectorAll('.token-row:not([style*=\"display: none\"]) .token-checkbox'));
                
                visibleCheckboxes.forEach(checkbox => {
                    checkbox.checked = isChecked;
                    const tokenId = checkbox.getAttribute('data-token-id');
                    if (isChecked) {
                        selectedTokens.add(tokenId);
                    } else {
                        selectedTokens.delete(tokenId);
                    }
                });
                
                updateSelectedCount();
            }

            // 處理單個 checkbox 變化
            function handleTokenCheckboxChange(event) {
                const tokenId = event.target.getAttribute('data-token-id');
                if (event.target.checked) {
                    selectedTokens.add(tokenId);
                } else {
                    selectedTokens.delete(tokenId);
                }
                updateSelectedCount();
                updateSelectAllState();
            }

            // 更新選擇計數
            function updateSelectedCount() {
                const countElement = document.getElementById('selectedCount');
                if (countElement) {
                    countElement.textContent = selectedTokens.size;
                }
                
                const btnRevealSelected = document.getElementById('btnRevealSelected');
                if (btnRevealSelected) {
                    btnRevealSelected.disabled = selectedTokens.size === 0;
                }
            }

            // 更新 Select All 狀態
            function updateSelectAllState() {
                const selectAllCheckbox = document.getElementById('selectAll');
                const visibleCheckboxes = Array.from(document.querySelectorAll('.token-row:not([style*=\"display: none\"]) .token-checkbox'));
                const checkedCount = visibleCheckboxes.filter(cb => cb.checked).length;
                
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = checkedCount > 0 && checkedCount === visibleCheckboxes.length;
                    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
                }
            }

            // 處理 Reveal Selected
            function handleRevealSelected() {
                if (selectedTokens.size === 0) return;
                
                const tokenIds = Array.from(selectedTokens);
                vscode.postMessage({ 
                    command: 'unmaskBatch', 
                    tokenIds,
                    count: tokenIds.length 
                });
            }

            // 處理 Reveal All
            function handleRevealAll() {
                const allTokenIds = Array.from(document.querySelectorAll('.token-row')).map(row => 
                    row.getAttribute('data-token-id')
                );
                vscode.postMessage({ 
                    command: 'unmaskAll',
                    tokenIds: allTokenIds,
                    count: allTokenIds.length
                });
            }

            // 處理 Export
            function handleExport() {
                const format = document.getElementById('exportFormat')?.value || 'json';
                vscode.postMessage({ 
                    command: 'export',
                    format: format
                });
            }

            // 處理 Reset All
            function handleResetAll() {
                document.querySelectorAll('.token-row.revealed').forEach(row => {
                    const tokenId = row.getAttribute('data-token-id');
                    hideToken(tokenId);
                });
                
                // 隱藏 Reset All 按鈕
                const btnResetAll = document.getElementById('btnResetAll');
                if (btnResetAll) {
                    btnResetAll.style.display = 'none';
                }
            }

            // 隱藏單個 Token
            function hideToken(tokenId) {
                const row = document.querySelector(\`[data-token-id="\${tokenId}"]\`);
                if (!row) return;
                
                const originalCell = row.querySelector('.original-value');
                if (originalCell) {
                    originalCell.innerHTML = '<span class="hidden-indicator">🔒 [Hidden]</span>';
                    originalCell.classList.add('hidden');
                    row.classList.remove('revealed');
                }

                // 切換按鈕
                const revealBtn = row.querySelector('.btn-reveal');
                const hideBtn = row.querySelector('.btn-hide');
                if (revealBtn && hideBtn) {
                    revealBtn.style.display = '';
                    revealBtn.textContent = '👁️';
                    revealBtn.disabled = false;
                    revealBtn.style.opacity = '';
                    revealBtn.style.cursor = '';
                    hideBtn.style.display = 'none';
                }

                // 取消選擇
                const checkbox = row.querySelector('.token-checkbox');
                if (checkbox) {
                    checkbox.checked = false;
                    selectedTokens.delete(tokenId);
                }
                
                updateSelectedCount();
            }

            // 處理表格行鍵盤事件
            function handleRowKeydown(event) {
                const row = event.currentTarget;
                
                switch(event.key) {
                    case 'Enter':
                    case ' ':
                        event.preventDefault();
                        const revealBtn = row.querySelector('.btn-reveal');
                        if (revealBtn) {
                            revealBtn.click();
                        }
                        break;
                    
                    case 'ArrowDown':
                        event.preventDefault();
                        const nextRow = row.nextElementSibling;
                        if (nextRow) {
                            nextRow.focus();
                        }
                        break;
                    
                    case 'ArrowUp':
                        event.preventDefault();
                        const prevRow = row.previousElementSibling;
                        if (prevRow) {
                            prevRow.focus();
                        }
                        break;
                }
            }

            // 搜尋功能
            function handleSearch(event) {
                const searchTerm = event.target.value.toLowerCase();
                const filterType = document.getElementById('filterType')?.value || '';
                
                allTokens.forEach(row => {
                    const tokenType = row.getAttribute('data-token-type');
                    const maskedValue = row.querySelector('.col-masked code')?.textContent.toLowerCase() || '';
                    
                    const matchesSearch = maskedValue.includes(searchTerm);
                    const matchesFilter = !filterType || tokenType === filterType;
                    
                    if (matchesSearch && matchesFilter) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                });
            }

            // 篩選功能
            function handleFilter(event) {
                const filterType = event.target.value;
                const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
                
                allTokens.forEach(row => {
                    const tokenType = row.getAttribute('data-token-type');
                    const maskedValue = row.querySelector('.col-masked code')?.textContent.toLowerCase() || '';
                    
                    const matchesSearch = !searchTerm || maskedValue.includes(searchTerm);
                    const matchesFilter = !filterType || tokenType === filterType;
                    
                    if (matchesSearch && matchesFilter) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                });
            }

            // 監聽來自擴充功能的訊息
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'revealToken':
                        revealToken(message.tokenId, message.originalValue);
                        break;
                    
                    case 'revealAll':
                        revealAllTokens(message.tokens);
                        break;
                    
                    case 'revealBatch':
                        if (message.tokens && Array.isArray(message.tokens)) {
                            message.tokens.forEach(token => {
                                revealToken(token.id, token.originalValue);
                            });
                        }
                        break;
                }
            });

            // 顯示單個 Token 的原始值
            function revealToken(tokenId, originalValue) {
                const row = document.querySelector(\`[data-token-id="\${tokenId}"]\`);
                if (!row) return;
                
                const originalCell = row.querySelector('.original-value');
                if (originalCell) {
                    originalCell.textContent = originalValue;
                    originalCell.classList.remove('hidden');
                    row.classList.add('revealed');
                }

                // 更新按鈕
                const revealBtn = row.querySelector('.btn-reveal');
                const hideBtn = row.querySelector('.btn-hide');
                if (revealBtn && hideBtn) {
                    revealBtn.style.display = 'none';
                    hideBtn.style.display = '';
                }

                // 顯示 Reset All 按鈕
                const btnResetAll = document.getElementById('btnResetAll');
                if (btnResetAll) {
                    btnResetAll.style.display = '';
                }
            }

            // 顯示所有 Token 的原始值
            function revealAllTokens(tokens) {
                tokens.forEach(token => {
                    revealToken(token.tokenId, token.originalValue);
                });
            }

            // 頁面載入時初始化
            init();
        `;
    }

    /**
     * 轉義 HTML
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * 釋放資源
     */
    public dispose(): void {
        PrivacyPreviewPanel.currentPanel = undefined;

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
