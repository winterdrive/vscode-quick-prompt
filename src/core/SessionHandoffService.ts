import * as vscode from 'vscode';
import * as path from 'path';
import { SessionManager } from './SessionManager';
import type { SessionHandoffRecord } from '../types/sessionHandoff';
import { CapturedSession, IChatExtractor } from './extractors/types';
import { CopilotExtractor } from './extractors/CopilotExtractor';
import { CursorExtractor } from './extractors/CursorExtractor';
import { AntigravityExtractor } from './extractors/AntigravityExtractor';
import { KiroExtractor } from './extractors/KiroExtractor';
import { WindsurfExtractor } from './extractors/WindsurfExtractor';
import { ClaudeExtractor } from './extractors/ClaudeExtractor';
import { CodexExtractor } from './extractors/CodexExtractor';
import { TraeExtractor } from './extractors/TraeExtractor';

export class SessionHandoffService {
    private extractors: IChatExtractor[];
    private cachedSessions: CapturedSession[] = [];
    private allSessions: CapturedSession[] = [];
    private scanMode: 'project' | 'all' = 'project';
    private _onDidUpdateSessions = new vscode.EventEmitter<void>();
    public readonly onDidUpdateSessions = this._onDidUpdateSessions.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.extractors = [
            new CopilotExtractor(),
            new CursorExtractor(),
            new AntigravityExtractor(),
            new KiroExtractor(),
            new WindsurfExtractor(),
            new ClaudeExtractor(),
            new CodexExtractor(),
            // new TraeExtractor(), // TODO: Fix garbled output for Trae
        ];
    }

    /**
     * Scan for ALL sessions that match the current workspace (project).
     */
    async scanProjectSessions(): Promise<CapturedSession[]> {
        this.scanMode = 'project';
        this.cachedSessions = [];
        this._onDidUpdateSessions.fire(); // Clear UI immediately

        const workspacePath = this.getWorkspaceRoot()?.fsPath;
        if (!workspacePath) {
            return [];
        }

        await Promise.all(
            this.extractors.map(async (e) => {
                try {
                    const sessions = await e.extractAll(workspacePath);
                    const matched = sessions.filter((s) => this.isSameWorkspace(s, workspacePath) && s.messages.length > 0);
                    if (matched.length > 0) {
                        this.cachedSessions.push(...matched);
                        this.cachedSessions.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
                        this._onDidUpdateSessions.fire(); // Stream update
                    }
                } catch (err) {
                    console.error(`[SessionHandoffService] Error extracting from ${e.ideId}:`, err);
                }
            })
        );
        return this.cachedSessions;
    }

    /**
     * Scan for ALL sessions from all supported IDEs.
     */
    async scanAllSessions(): Promise<CapturedSession[]> {
        this.scanMode = 'all';
        this.allSessions = [];
        this._onDidUpdateSessions.fire(); // Clear UI immediately

        await Promise.all(
            this.extractors.map(async (e) => {
                try {
                    // Fetch-all should not be constrained by current workspace.
                    const sessions = await e.extractAll(undefined);
                    if (sessions.length > 0) {
                        this.allSessions.push(...sessions);
                        this.allSessions.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
                        this._onDidUpdateSessions.fire(); // Stream update
                    }
                } catch (err) {
                    console.error(`[SessionHandoffService] Error extracting all from ${e.ideId}:`, err);
                }
            })
        );
        return this.allSessions;
    }

    /**
     * Backward compatibility for existing code.
     */
    async scanAllIDEs(): Promise<CapturedSession[]> {
        return this.scanProjectSessions();
    }

    getSessions(): CapturedSession[] {
        return this.scanMode === 'all' ? this.allSessions : this.cachedSessions;
    }

    getScanMode(): 'project' | 'all' {
        return this.scanMode;
    }

    private normalizePath(p: string): string {
        return path.resolve(p).replace(/\\/g, '/').toLowerCase();
    }

    /**
     * Best-effort matching: prefer explicit workspacePath, fall back to rawPath substring match.
     */
    private isSameWorkspace(session: CapturedSession, workspacePath: string): boolean {
        const ws = this.normalizePath(workspacePath);

        if (session.workspacePath) {
            return this.normalizePath(session.workspacePath) === ws;
        }

        if (session.rawPath) {
            const raw = this.normalizePath(session.rawPath);
            return raw.includes(ws);
        }

        return false;
    }

    getGroupedSessions(): Map<string, CapturedSession[]> {
        const sessions = this.getSessions();
        const groups = new Map<string, CapturedSession[]>();
        
        // Ensure all known IDEs have a group, even if empty
        for (const e of this.extractors) {
            groups.set(e.ideId, []);
        }

        for (const s of sessions) {
            const group = groups.get(s.sourceIde) || [];
            group.push(s);
            groups.set(s.sourceIde, group);
        }
        return groups;
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
        return `你現在接手上一段 AI session，請先閱讀以下資訊並先用你的話總結目前理解（包含目前的目標、已嘗試的方法與下一步），再提出接手後的執行計畫：\n\n---\n${history}\n---\n\n`;
    }

    public buildPromptFromCapturedSession(session: CapturedSession): string {
        const lines: string[] = [
            `你現在接手來自 ${session.sourceIde} 的上一段 AI session，請先閱讀以下對話歷史並先用你的話總結目前理解（包含目前的目標、已嘗試的方法與下一步），再提出接手後的執行計畫：`,
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

        return lines.join('\n');
    }

    public getCachedSessions(): CapturedSession[] {
        return this.cachedSessions;
    }
}
