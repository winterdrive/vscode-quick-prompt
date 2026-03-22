/**
 * Privacy Protection Commands
 * Quick Prompt v0.3.0
 */

import * as vscode from 'vscode';
import { MaskingEngine } from '../privacy/maskingEngine';
import { PrivacyPreviewPanel } from '../ui/privacyPreviewPanel';

/**
 * 註冊所有隱私保護相關命令
 */
export function registerPrivacyCommands(
    context: vscode.ExtensionContext,
    maskingEngine: MaskingEngine
): void {
    
    // 遮罩剪貼簿內容
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.maskClipboard', async () => {
            try {
                const text = await vscode.env.clipboard.readText();
                
                if (!text) {
                    vscode.window.showInformationMessage('Clipboard is empty');
                    return;
                }

                const result = await maskingEngine.maskText(text, {
                    enablePatterns: true,
                    enableNER: false,  // Phase 1: 先只啟用 Pattern
                    enableDictionary: false,
                    storeSecurely: true
                });

                if (result.tokens.length > 0) {
                    await vscode.env.clipboard.writeText(result.maskedText);
                    vscode.window.showInformationMessage(
                        `🔒 Masked ${result.tokens.length} sensitive item(s) in clipboard`
                    );
                } else {
                    vscode.window.showInformationMessage('No sensitive information detected');
                }

            } catch (error) {
                console.error('[PrivacyCommands] Error masking clipboard:', error);
                vscode.window.showErrorMessage('Failed to mask clipboard content');
            }
        })
    );

    // 解除遮罩剪貼簿內容
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.unmaskClipboard', async () => {
            try {
                const maskedText = await vscode.env.clipboard.readText();
                
                if (!maskedText) {
                    vscode.window.showInformationMessage('Clipboard is empty');
                    return;
                }

                const unmaskedText = await maskingEngine.unmaskText(maskedText);
                
                if (unmaskedText) {
                    await vscode.env.clipboard.writeText(unmaskedText);
                    vscode.window.showInformationMessage('🔓 Clipboard unmasked');
                }

            } catch (error) {
                console.error('[PrivacyCommands] Error unmasking clipboard:', error);
                vscode.window.showErrorMessage('Failed to unmask clipboard content');
            }
        })
    );

    // 預覽遮罩效果
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.previewMasking', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                
                if (!editor) {
                    vscode.window.showInformationMessage('No active editor');
                    return;
                }

                const selection = editor.selection;
                const text = editor.document.getText(selection.isEmpty ? undefined : selection);

                if (!text) {
                    vscode.window.showInformationMessage('No text selected');
                    return;
                }

                const result = await maskingEngine.maskText(text, {
                    enablePatterns: true,
                    enableNER: true,  // 啟用所有策略
                    enableDictionary: true,
                    storeSecurely: false  // 預覽模式不儲存
                });

                // 使用新的 WebView 面板顯示預覽
                const panel = PrivacyPreviewPanel.createOrShow(
                    context.extensionUri,
                    maskingEngine
                );
                await panel.updatePreview(result);

            } catch (error) {
                console.error('[PrivacyCommands] Error previewing masking:', error);
                vscode.window.showErrorMessage('Failed to preview masking');
            }
        })
    );

    // 新增到隱私字典
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.addToPrivacyDictionary', async () => {
            const editor = vscode.window.activeTextEditor;
            
            if (!editor) {
                vscode.window.showInformationMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const text = editor.document.getText(selection);

            if (!text) {
                vscode.window.showInformationMessage('Please select text to add to dictionary');
                return;
            }

            const dictionaryManager = maskingEngine.getDictionaryManager();
            if (!dictionaryManager) {
                vscode.window.showErrorMessage('Dictionary not available. Please open a workspace.');
                return;
            }

            // 詢問遮罩類型
            const type = await vscode.window.showQuickPick(
                [
                    { label: 'Exact Match', description: 'Match exact text', value: false },
                    { label: 'Regex Pattern', description: 'Use regular expression', value: true }
                ],
                { placeHolder: 'Select match type' }
            );

            if (!type) {
                return;
            }

            // 詢問標籤
            const label = await vscode.window.showInputBox({
                prompt: 'Enter mask label (e.g., [CUSTOMER-NAME])',
                placeHolder: '[CUSTOM-1]',
                value: '[CUSTOM-1]',
                validateInput: (value) => {
                    if (!value.startsWith('[') || !value.endsWith(']')) {
                        return 'Label must be wrapped in brackets, e.g., [LABEL]';
                    }
                    return null;
                }
            });

            if (!label) {
                return;
            }

            // 詢問備註（可選）
            const note = await vscode.window.showInputBox({
                prompt: 'Add a note (optional)',
                placeHolder: 'e.g., Customer name pattern'
            });

            try {
                await dictionaryManager.addEntry({
                    pattern: text,
                    isRegex: type.value,
                    label,
                    enabled: true,
                    note
                });

                vscode.window.showInformationMessage(
                    `✅ Added "${text}" to privacy dictionary with label "${label}"`
                );

            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to add to dictionary: ${error.message}`);
            }
        })
    );

    // 管理隱私字典
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.managePrivacyDictionary', async () => {
            const dictionaryManager = maskingEngine.getDictionaryManager();
            if (!dictionaryManager) {
                vscode.window.showErrorMessage('Dictionary not available. Please open a workspace.');
                return;
            }

            // 顯示字典管理 Quick Pick
            await showDictionaryManagementMenu(dictionaryManager);
        })
    );

    // 清除所有遮罩映射
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.clearMaskMappings', async () => {
            await maskingEngine.clearAllMappings();
        })
    );

    // 顯示遮罩報告
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.showMaskingReport', async () => {
            try {
                const stats = await maskingEngine.getStats();
                
                // 擴展統計資訊
                const cacheInfo = stats.cache ? `
📦 Cache Statistics:
• Size: ${stats.cache.size} entries
• Hit Rate: ${(stats.cache.hitRate * 100).toFixed(1)}%
• Avg Time: ${stats.cache.avgProcessingTime.toFixed(0)}ms` : '';

                const nerInfo = stats.ner ? `
🤖 NER Model: ${stats.ner.model}
• State: ${stats.ner.state}` : '';

                const message = `
📊 Privacy Protection Statistics

🔒 Total Masks: ${stats.totalMasks}
✅ Enabled Patterns: ${stats.enabledPatterns}/${stats.totalPatterns}
📅 Oldest Mask: ${stats.oldestMask.toLocaleString()}
📅 Newest Mask: ${stats.newestMask.toLocaleString()}
${cacheInfo}${nerInfo}
                `.trim();

                vscode.window.showInformationMessage(message, { modal: true }, 'Open Settings', 'Clear Cache').then(selection => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'quickPrompt.privacy');
                    } else if (selection === 'Clear Cache') {
                        vscode.commands.executeCommand('quickPrompt.nerClearCache');
                    }
                });

            } catch (error) {
                console.error('[PrivacyCommands] Error showing report:', error);
                vscode.window.showErrorMessage('Failed to generate masking report');
            }
        })
    );

    // 清理過期遮罩
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.cleanupExpiredMasks', async () => {
            try {
                await maskingEngine.cleanupExpired();
                vscode.window.showInformationMessage('✅ Expired masks cleaned up');
            } catch (error) {
                console.error('[PrivacyCommands] Error cleaning up:', error);
                vscode.window.showErrorMessage('Failed to cleanup expired masks');
            }
        })
    );

    // NER 模型狀態
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.nerModelStatus', async () => {
            await showNERModelStatus(maskingEngine);
        })
    );

    // 清除 NER 快取
    context.subscriptions.push(
        vscode.commands.registerCommand('quickPrompt.nerClearCache', async () => {
            await clearNERCache(maskingEngine);
        })
    );
}

/**
 * 顯示遮罩預覽面板
 */
async function showMaskingPreview(
    original: string,
    masked: string,
    maskCount: number
): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'maskingPreview',
        'Privacy Masking Preview',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true
        }
    );

    panel.webview.html = getMaskingPreviewHTML(original, masked, maskCount);
}

/**
 * 生成預覽 HTML
 */
function getMaskingPreviewHTML(original: string, masked: string, maskCount: number): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Masking Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
        }
        .container {
            display: flex;
            gap: 20px;
        }
        .panel {
            flex: 1;
            border: 1px solid var(--vscode-panel-border);
            padding: 15px;
            border-radius: 5px;
        }
        .panel h2 {
            margin-top: 0;
            font-size: 16px;
            color: var(--vscode-textLink-foreground);
        }
        pre {
            background: var(--vscode-editor-background);
            padding: 10px;
            border-radius: 3px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .stats {
            margin: 20px 0;
            padding: 15px;
            background: var(--vscode-editor-background);
            border-radius: 5px;
        }
        .masked-text {
            color: #ff6b6b;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <h1>🔒 Privacy Masking Preview</h1>
    
    <div class="stats">
        <strong>Masked Items:</strong> ${maskCount}
    </div>

    <div class="container">
        <div class="panel">
            <h2>📄 Original Text</h2>
            <pre>${escapeHtml(original)}</pre>
        </div>
        
        <div class="panel">
            <h2>🔒 Masked Text</h2>
            <pre class="masked-text">${escapeHtml(masked)}</pre>
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * 轉義 HTML 特殊字元
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 顯示字典管理選單
 */
async function showDictionaryManagementMenu(dictionaryManager: any): Promise<void> {
    const stats = dictionaryManager.getStats();
    
    const action = await vscode.window.showQuickPick(
        [
            {
                label: '$(list-unordered) View All Entries',
                description: `${stats.total} total, ${stats.enabled} enabled`,
                action: 'view'
            },
            {
                label: '$(add) Add New Entry',
                description: 'Create a new dictionary entry',
                action: 'add'
            },
            {
                label: '$(search) Search Entries',
                description: 'Search by pattern or label',
                action: 'search'
            },
            {
                label: '$(export) Export Dictionary',
                description: 'Export to JSON file',
                action: 'export'
            },
            {
                label: '$(import) Import Dictionary',
                description: 'Import from JSON file',
                action: 'import'
            },
            {
                label: '$(graph) Show Statistics',
                description: 'View dictionary statistics',
                action: 'stats'
            },
            {
                label: '$(trash) Clear All Entries',
                description: 'Delete all dictionary entries',
                action: 'clear'
            }
        ],
        { placeHolder: 'Select an action' }
    );

    if (!action) {
        return;
    }

    switch (action.action) {
        case 'view':
            await viewAllEntries(dictionaryManager);
            break;
        case 'add':
            await addNewEntry(dictionaryManager);
            break;
        case 'search':
            await searchEntries(dictionaryManager);
            break;
        case 'export':
            await exportDictionary(dictionaryManager);
            break;
        case 'import':
            await importDictionary(dictionaryManager);
            break;
        case 'stats':
            await showDictionaryStats(dictionaryManager);
            break;
        case 'clear':
            await clearDictionary(dictionaryManager);
            break;
    }
}

/**
 * 查看所有條目
 */
async function viewAllEntries(dictionaryManager: any): Promise<void> {
    const entries = dictionaryManager.getAllEntries();
    
    if (entries.length === 0) {
        vscode.window.showInformationMessage('Dictionary is empty');
        return;
    }

    interface QuickPickEntryItem extends vscode.QuickPickItem {
        entry: any;
    }

    const selected = await vscode.window.showQuickPick<QuickPickEntryItem>(
        entries.map((entry: any): QuickPickEntryItem => ({
            label: `${entry.enabled ? '✅' : '❌'} ${entry.label}`,
            description: entry.pattern,
            detail: `${entry.isRegex ? 'Regex' : 'Text'} | ${entry.note || 'No note'}`,
            entry
        })),
        { placeHolder: 'Select an entry to edit or delete' }
    );

    if (selected) {
        await editOrDeleteEntry(dictionaryManager, selected.entry);
    }
}

/**
 * 編輯或刪除條目
 */
async function editOrDeleteEntry(dictionaryManager: any, entry: any): Promise<void> {
    const action = await vscode.window.showQuickPick(
        [
            { label: '$(edit) Edit', action: 'edit' },
            { label: `$(${entry.enabled ? 'circle-slash' : 'check'}) ${entry.enabled ? 'Disable' : 'Enable'}`, action: 'toggle' },
            { label: '$(trash) Delete', action: 'delete' }
        ],
        { placeHolder: `Manage: ${entry.label}` }
    );

    if (!action) {
        return;
    }

    try {
        switch (action.action) {
            case 'edit':
                const newLabel = await vscode.window.showInputBox({
                    prompt: 'Enter new label',
                    value: entry.label
                });
                if (newLabel) {
                    await dictionaryManager.updateEntry(entry.id, { label: newLabel });
                    vscode.window.showInformationMessage('Entry updated');
                }
                break;

            case 'toggle':
                await dictionaryManager.updateEntry(entry.id, { enabled: !entry.enabled });
                vscode.window.showInformationMessage(`Entry ${entry.enabled ? 'disabled' : 'enabled'}`);
                break;

            case 'delete':
                const confirm = await vscode.window.showWarningMessage(
                    `Delete "${entry.label}"?`,
                    { modal: true },
                    'Delete'
                );
                if (confirm === 'Delete') {
                    await dictionaryManager.deleteEntry(entry.id);
                    vscode.window.showInformationMessage('Entry deleted');
                }
                break;
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Operation failed: ${error.message}`);
    }
}

/**
 * 新增條目
 */
async function addNewEntry(dictionaryManager: any): Promise<void> {
    const pattern = await vscode.window.showInputBox({
        prompt: 'Enter pattern to mask',
        placeHolder: 'e.g., customer@example.com or John.*'
    });

    if (!pattern) {
        return;
    }

    const type = await vscode.window.showQuickPick(
        [
            { label: 'Exact Match', value: false },
            { label: 'Regex Pattern', value: true }
        ],
        { placeHolder: 'Select match type' }
    );

    if (!type) {
        return;
    }

    const label = await vscode.window.showInputBox({
        prompt: 'Enter mask label',
        placeHolder: '[CUSTOM-1]',
        validateInput: (value) => {
            if (!value.startsWith('[') || !value.endsWith(']')) {
                return 'Label must be wrapped in brackets';
            }
            return null;
        }
    });

    if (!label) {
        return;
    }

    try {
        await dictionaryManager.addEntry({
            pattern,
            isRegex: type.value,
            label,
            enabled: true
        });
        vscode.window.showInformationMessage('Entry added successfully');
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to add entry: ${error.message}`);
    }
}

/**
 * 搜尋條目
 */
async function searchEntries(dictionaryManager: any): Promise<void> {
    const query = await vscode.window.showInputBox({
        prompt: 'Search entries',
        placeHolder: 'Enter search query'
    });

    if (!query) {
        return;
    }

    const results = dictionaryManager.searchEntries(query);
    
    if (results.length === 0) {
        vscode.window.showInformationMessage('No results found');
        return;
    }

    vscode.window.showInformationMessage(`Found ${results.length} entries matching "${query}"`);
}

/**
 * 匯出字典
 */
async function exportDictionary(dictionaryManager: any): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('privacy-dictionary.json'),
        filters: { 'JSON': ['json'] }
    });

    if (uri) {
        try {
            await dictionaryManager.exportDictionary(uri.fsPath);
            vscode.window.showInformationMessage(`Dictionary exported to ${uri.fsPath}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Export failed: ${error.message}`);
        }
    }
}

/**
 * 匯入字典
 */
async function importDictionary(dictionaryManager: any): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { 'JSON': ['json'] }
    });

    if (uris && uris.length > 0) {
        try {
            const count = await dictionaryManager.importDictionary(uris[0].fsPath, true);
            vscode.window.showInformationMessage(`Imported ${count} entries`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Import failed: ${error.message}`);
        }
    }
}

/**
 * 顯示統計資訊
 */
async function showDictionaryStats(dictionaryManager: any): Promise<void> {
    const stats = dictionaryManager.getStats();
    
    const message = `
📊 Privacy Dictionary Statistics

📝 Total Entries: ${stats.total}
✅ Enabled: ${stats.enabled}
❌ Disabled: ${stats.disabled}
🔤 Text Patterns: ${stats.textPatterns}
🔧 Regex Patterns: ${stats.regexPatterns}
    `.trim();

    vscode.window.showInformationMessage(message);
}

/**
 * 清除字典
 */
async function clearDictionary(dictionaryManager: any): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        'This will delete all dictionary entries. Continue?',
        { modal: true },
        'Clear All'
    );

    if (confirm === 'Clear All') {
        await dictionaryManager.clear();
        vscode.window.showInformationMessage('Dictionary cleared');
    }
}

// ====== NER Commands ======

/**
 * 顯示 NER 模型狀態
 */
async function showNERModelStatus(maskingEngine: MaskingEngine): Promise<void> {
    try {
        const stats = await maskingEngine.getStats();
        const nerEngine = maskingEngine.getNEREngine();
        
        if (!nerEngine) {
            vscode.window.showInformationMessage('NER Engine not initialized');
            return;
        }

        const modelInfo = nerEngine.getModelInfo();
        const modelState = modelInfo.state;
        const stateIcon = {
            'uninitialized': '⚪',
            'loading': '🔄',
            'ready': '✅',
            'error': '❌'
        }[modelState] || '❓';

        const message = `
🤖 NER Model Status

${stateIcon} State: ${modelState}
📦 Model: ${modelInfo.name}
🔧 Quantized: ${modelInfo.config.quantized ? 'Yes' : 'No'}
🌍 Languages: ${modelInfo.config.languages.join(', ')}
📊 Confidence Threshold: ${(modelInfo.config.confidenceThreshold * 100).toFixed(0)}%
🚀 Use Worker: ${modelInfo.config.useWorker ? 'Yes' : 'No'}

📈 Cache Statistics:
• Size: ${stats.cache?.size || 0} entries
• Hit Rate: ${((stats.cache?.hitRate || 0) * 100).toFixed(1)}%
• Avg Time: ${(stats.cache?.avgProcessingTime || 0).toFixed(0)}ms
        `.trim();

        vscode.window.showInformationMessage(message, { modal: true });

    } catch (error) {
        console.error('[NER] Failed to get model status:', error);
        vscode.window.showErrorMessage('Failed to get NER model status');
    }
}

/**
 * 清除 NER 快取
 */
async function clearNERCache(maskingEngine: MaskingEngine): Promise<void> {
    try {
        const confirm = await vscode.window.showWarningMessage(
            'Clear NER cache? This will remove all cached masking results.',
            { modal: true },
            'Clear Cache'
        );

        if (confirm === 'Clear Cache') {
            const stats = await maskingEngine.getStats();
            const sizeBefore = stats.cache?.size || 0;
            
            maskingEngine.clearCache();
            
            vscode.window.showInformationMessage(
                `🗑️ Cleared ${sizeBefore} cached entries`
            );
        }

    } catch (error) {
        console.error('[NER] Failed to clear cache:', error);
        vscode.window.showErrorMessage('Failed to clear NER cache');
    }
}
