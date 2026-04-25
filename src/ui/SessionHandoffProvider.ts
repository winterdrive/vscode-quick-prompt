import * as vscode from 'vscode';
import { SessionHandoffService } from '../core/SessionHandoffService';
import { CapturedSession } from '../core/extractors/types';

export class SessionItem extends vscode.TreeItem {
    constructor(
        public readonly session: CapturedSession,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        
        this.tooltip = `Source: ${session.sourceIde}\nCaptured: ${new Date(session.capturedAt).toLocaleString()}`;
        this.description = new Date(session.capturedAt).toLocaleString();
        
        // Define context value for menus (inline actions)
        this.contextValue = 'sessionItem';
        
        // Assign icon based on IDE
        this.iconPath = new vscode.ThemeIcon(this.getIconNameForIde(session.sourceIde));
    }

    private getIconNameForIde(ide: string): string {
        switch (ide.toLowerCase()) {
            case 'copilot': return 'github';
            case 'cursor': return 'terminal-bash';
            case 'antigravity': return 'hubot';
            case 'kiro': return 'sparkle';
            case 'windsurf': return 'rocket';
            case 'trae': return 'shield';
            default: return 'archive';
        }
    }
}

export class SessionHandoffProvider implements vscode.TreeDataProvider<SessionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SessionItem | undefined | null | void> = new vscode.EventEmitter<SessionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SessionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private readonly service: SessionHandoffService) {
        // Listen to service updates
        this.service.onDidUpdateSessions(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SessionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SessionItem): Promise<SessionItem[]> {
        if (element) {
            return []; // No children for now
        } else {
            const sessions = this.service.getCachedSessions();
            if (sessions.length === 0) {
                return []; // This will trigger the viewsWelcome in package.json
            }
            
            return sessions.map(session => {
                const label = session.sourceIde.charAt(0).toUpperCase() + session.sourceIde.slice(1) + ' Session';
                return new SessionItem(session, label, vscode.TreeItemCollapsibleState.None);
            });
        }
    }
}
