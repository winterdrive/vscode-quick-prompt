export interface SessionHandoffRecord {
    version: string;
    workspaceHash: string;
    sourceIde: string;
    savedAt: string;
    history?: string;
    goal?: string;
    summary?: string;
    nextSteps?: string;
    handoffPrompt: string;
}

