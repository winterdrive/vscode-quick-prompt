import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { SessionHandoffRecord } from '../types/sessionHandoff';

export class SessionManager {
    public static readonly HANDOFF_DIR = '.edo_tensei';

    constructor(private readonly workspaceRoot: string) { }

    public getWorkspaceHash(): string {
        return crypto.createHash('sha1').update(this.workspaceRoot).digest('hex').slice(0, 12);
    }

    public getSessionFilePath(): string {
        const hash = this.getWorkspaceHash();
        return path.join(this.workspaceRoot, SessionManager.HANDOFF_DIR, `${hash}.json`);
    }

    public hasSession(): boolean {
        try {
            return fs.existsSync(this.getSessionFilePath());
        } catch {
            return false;
        }
    }

    public readSession(): SessionHandoffRecord | undefined {
        const filePath = this.getSessionFilePath();
        try {
            if (!fs.existsSync(filePath)) {
                return undefined;
            }
            const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw) as SessionHandoffRecord;
        } catch {
            return undefined;
        }
    }

    public saveSession(input: { history?: string; goal?: string; summary?: string; nextSteps?: string }): string | undefined {
        const filePath = this.getSessionFilePath();
        const dir = path.dirname(filePath);

        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const record: SessionHandoffRecord = {
                version: '0.1.0',
                workspaceHash: this.getWorkspaceHash(),
                sourceIde: 'quickprompt-mcp', // Default for node, can be overridden
                savedAt: new Date().toISOString(),
                history: input.history?.trim(),
                goal: input.goal?.trim(),
                summary: input.summary?.trim(),
                nextSteps: input.nextSteps?.trim(),
                handoffPrompt: this.buildHandoffPrompt(input),
            };

            fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
            return filePath;
        } catch (e) {
            console.error('Failed to save session:', e);
            return undefined;
        }
    }

    public buildHandoffPrompt(input: { history?: string; goal?: string; summary?: string; nextSteps?: string }): string {
        const lines: string[] = [
            '你現在接手上一段 AI session，請先閱讀以下資訊並先用你的話總結目前理解（包含目前的目標、已嘗試的方法與下一步），再提出接手後的執行計畫：',
            '',
        ];

        if (input.history) {
            lines.push('---');
            lines.push(input.history.trim());
            lines.push('---');
            lines.push('');
        }

        if (input.goal) {
            lines.push(`當前目標：${input.goal.trim()}`);
            lines.push('');
        }

        if (input.summary) {
            lines.push('任務摘要：');
            lines.push(input.summary.trim());
            lines.push('');
        }

        if (input.nextSteps) {
            lines.push('下一步：');
            lines.push(input.nextSteps.trim());
            lines.push('');
        }
        
        return lines.join('\n');
        
        return lines.join('\n');
    }
}
