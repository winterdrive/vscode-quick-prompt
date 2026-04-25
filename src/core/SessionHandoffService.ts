import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';
import type { SessionHandoffRecord } from '../types/sessionHandoff';
import { CapturedSession, IChatExtractor } from './extractors/types';
import { CopilotExtractor } from './extractors/CopilotExtractor';
import { CursorExtractor } from './extractors/CursorExtractor';
import { AntigravityExtractor } from './extractors/AntigravityExtractor';
import { KiroExtractor } from './extractors/KiroExtractor';
import { WindsurfExtractor } from './extractors/WindsurfExtractor';
import { TraeExtractor } from './extractors/TraeExtractor';

export class SessionHandoffService {
    private extractors: IChatExtractor[];
    private cachedSessions: CapturedSession[] = [];
    private _onDidUpdateSessions = new vscode.EventEmitter<void>();
    public readonly onDidUpdateSessions = this._onDidUpdateSessions.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.extractors = [
            new CopilotExtractor(),
            new CursorExtractor(),
            new AntigravityExtractor(),
            new KiroExtractor(),
            new WindsurfExtractor(),
            new TraeExtractor()
        ];
    }

    public getWorkspaceRoot(): vscode.Uri | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri : undefined;
    }

    private getSessionManager(): SessionManager | undefined {
        const root = this.getWorkspaceRoot();
        if (!root) {
            return undefined;
        }
        return new SessionManager(root.fsPath);
    }

    public getSessionFileUri(): vscode.Uri | undefined {
        const manager = this.getSessionManager();
        if (!manager) {
            return undefined;
        }
        return vscode.Uri.file(manager.getSessionFilePath());
    }

    public async hasSession(): Promise<boolean> {
        const manager = this.getSessionManager();
        return manager ? manager.hasSession() : false;
    }

    public async readSession(): Promise<SessionHandoffRecord | undefined> {
        const manager = this.getSessionManager();
        return manager ? manager.readSession() : undefined;
    }

    public async saveSession(history: string): Promise<vscode.Uri | undefined> {
        const manager = this.getSessionManager();
        if (!manager) {
            return undefined;
        }

        const filePath = manager.saveSession({ history });
        if (!filePath) {
            return undefined;
        }

        const record = manager.readSession();
        if (record) {
            // override the sourceIde for VS Code context
            record.sourceIde = vscode.env.appName || 'unknown';
            
            // Re-save with updated sourceIde using VS Code API to ensure VS Code filesystem events are fired
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(record, null, 2), 'utf-8'));
            return uri;
        }

        return vscode.Uri.file(filePath);
    }

    public buildHandoffPrompt(history: string): string {
        const manager = this.getSessionManager();
        if (manager) {
            return manager.buildHandoffPrompt({ history });
        }
        return `你現在接手上一段 AI session，請先閱讀以下對話歷史紀錄：\n\n---\n${history}\n---\n\n請先用你的話總結目前理解（包含目前的目標、已嘗試的方法與下一步），再提出接手後的執行計畫。`;
    }

    public buildPromptFromCapturedSession(session: CapturedSession): string {
        const lines: string[] = [
            `你現在接手來自 ${session.sourceIde} 的上一段 AI session，請先閱讀以下對話歷史紀錄：`,
            '',
        ];

        lines.push('---');
        for (const msg of session.messages) {
            lines.push(`[${msg.role.toUpperCase()}]`);
            if (msg.thought) {
                lines.push(`🤔 思考過程:\n${msg.thought}\n`);
            }
            if (msg.toolCalls && msg.toolCalls.length > 0) {
                lines.push(`🛠️ 工具調用: ${msg.toolCalls.length} 次`);
            }
            lines.push(msg.content);
            lines.push('');
        }
        lines.push('---');
        lines.push('');
        lines.push('請先用你的話總結目前理解（包含目前的目標、已嘗試的方法與下一步），再提出接手後的執行計畫。');

        return lines.join('\n');
    }

    public getCachedSessions(): CapturedSession[] {
        return this.cachedSessions;
    }

    public async scanAllIDEs(): Promise<CapturedSession[]> {
        const root = this.getWorkspaceRoot();
        if (!root) {
            this.cachedSessions = [];
            this._onDidUpdateSessions.fire();
            return [];
        }

        const workspacePath = root.fsPath;
        const promises = this.extractors.map(async (extractor) => {
            try {
                return await extractor.extract(workspacePath);
            } catch (error) {
                console.error(`Error running extractor ${extractor.constructor.name}:`, error);
                return null;
            }
        });

        const results = await Promise.all(promises);
        
        this.cachedSessions = results
            .filter((session): session is CapturedSession => session !== null && session.readStatus === 'success')
            // Sort by capturedAt descending
            .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

        this._onDidUpdateSessions.fire();
        return this.cachedSessions;
    }
}


