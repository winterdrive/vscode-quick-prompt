import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type SkillGenerationResult =
    | { status: 'generated'; target: string; projectRoot: string; skillPaths: string[] }
    | { status: 'auto'; projectRoot: string }
    | { status: 'cancelled'; projectRoot: string }
    | { status: 'no_workspace' };

export class SkillGenerator {
    public static async getProjectRoot(): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        if (workspaceFolders.length === 1) {
            return workspaceFolders[0].uri.fsPath;
        }
        const picked = await vscode.window.showQuickPick(
            workspaceFolders.map(f => ({ label: f.name, description: f.uri.fsPath, uri: f.uri })),
            { placeHolder: 'Select workspace to install the skill into' }
        );
        return picked?.uri.fsPath;
    }

    public static getMcpServerScriptPath(context: vscode.ExtensionContext): string {
        return path.join(context.extensionPath, 'dist', 'mcp', 'index.js').replace(/\\/g, '/');
    }

    public static async generateSkill(context: vscode.ExtensionContext): Promise<SkillGenerationResult> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace opened.');
            return { status: 'no_workspace' };
        }

        const isMultiRoot = workspaceFolders.length > 1;

        // Detect active editor folder — only for pre-selection hint, never skips the picker
        let detectedRoot = '';
        if (isMultiRoot) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
                if (activeFolder) { detectedRoot = activeFolder.uri.fsPath; }
            }
        }

        interface WorkspaceOption extends vscode.QuickPickItem { uri: vscode.Uri }
        const workspaceOptions: WorkspaceOption[] = workspaceFolders.map(f => ({
            label: f.name,
            description: f.uri.fsPath,
            uri: f.uri,
        }));

        interface ModeOption extends vscode.QuickPickItem { value: 'auto' | 'manual' | '__back__' }
        interface AgentOption extends vscode.QuickPickItem { value: string }

        const agentOptions: AgentOption[] = [
            { label: '$(arrow-left) Back',          description: '',                                           value: '__back__' },
            { label: '$(file-code) Cursor',         description: '.cursor/rules/quickprompt.mdc',             value: 'cursor' },
            { label: '$(file-code) Antigravity',    description: '.agents/skills/quickprompt/SKILL.md',       value: 'antigravity' },
            { label: '$(file-code) Claude Code',    description: '.claude/skills/quickprompt/SKILL.md',       value: 'claude' },
            { label: '$(file-code) GitHub Copilot', description: '.github/skills/quickprompt/SKILL.md',       value: 'copilot' },
            { label: '$(file-code) Kiro IDE',       description: '.kiro/skills/quickprompt/SKILL.md',         value: 'kiro' },
            { label: '$(file-code) Cline',          description: '.cline/skills/quickprompt/SKILL.md',        value: 'cline' },
            { label: '$(file-code) Gemini CLI',     description: '.gemini/skills/quickprompt/SKILL.md',       value: 'gemini' },
        ];

        type State = 'workspace' | 'mode' | 'agents';
        let state: State = isMultiRoot ? 'workspace' : 'mode';
        let projectRoot: string = isMultiRoot ? '' : workspaceFolders[0].uri.fsPath;

        // eslint-disable-next-line no-constant-condition
        while (true) {

            if (state === 'workspace') {
                const qp = vscode.window.createQuickPick<WorkspaceOption>();
                qp.items = workspaceOptions;
                qp.placeholder = 'Select workspace to install the skill into';
                if (detectedRoot) {
                    const hint = workspaceOptions.find(o => o.uri.fsPath === detectedRoot);
                    if (hint) { qp.activeItems = [hint]; }
                }
                const picked = await new Promise<WorkspaceOption | undefined>(resolve => {
                    qp.onDidAccept(() => resolve(qp.activeItems[0]));
                    qp.onDidHide(() => resolve(undefined));
                    qp.show();
                });
                qp.dispose();
                if (!picked) { return { status: 'cancelled', projectRoot: '' }; }
                projectRoot = picked.uri.fsPath;
                state = 'mode';
                continue;
            }

            if (state === 'mode') {
                const modeOptions: ModeOption[] = [
                    ...(isMultiRoot ? [{ label: '$(arrow-left) Back', description: 'Re-select workspace', value: '__back__' as const }] : []),
                    {
                        label: '$(cloud-download) Auto Install (Recommended)',
                        description: 'npx skills add winterdrive/QuickPrompt',
                        detail: 'Installs to all AI agents detected in your workspace',
                        value: 'auto' as const,
                    },
                    {
                        label: '$(file-code) Manual Install',
                        description: 'Pick one or more agents yourself',
                        value: 'manual' as const,
                    },
                ];
                const mode = await vscode.window.showQuickPick(modeOptions, {
                    placeHolder: `Install QuickPrompt skill${isMultiRoot ? ` into "${workspaceFolders.find(f => f.uri.fsPath === projectRoot)?.name}"` : ''}`,
                });
                if (!mode) { return { status: 'cancelled', projectRoot }; }
                if (mode.value === '__back__') { state = 'workspace'; continue; }
                if (mode.value === 'auto') {
                    const terminal = vscode.window.createTerminal({ name: 'QuickPrompt: Install Skill', cwd: projectRoot });
                    terminal.show(true);
                    terminal.sendText('npx skills add winterdrive/QuickPrompt');
                    return { status: 'auto', projectRoot };
                }
                state = 'agents';
                continue;
            }

            // state === 'agents'
            const choices = await vscode.window.showQuickPick(agentOptions, {
                placeHolder: 'Select one or more AI agents to generate the skill file for',
                canPickMany: true,
            });
            if (!choices || choices.length === 0) { return { status: 'cancelled', projectRoot }; }
            if (choices.some(c => c.value === '__back__')) { state = 'mode'; continue; }

            const mcpServerScriptPath = this.getMcpServerScriptPath(context);
            const skillPaths: string[] = [];

            for (const choice of choices) {
                if (choice.value === 'cursor') {
                    skillPaths.push(await this.generateCursorRule(context, projectRoot, mcpServerScriptPath));
                } else if (choice.value === 'antigravity') {
                    skillPaths.push(await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.agents'));
                } else if (choice.value === 'claude') {
                    skillPaths.push(await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.claude'));
                } else if (choice.value === 'copilot') {
                    skillPaths.push(await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.github'));
                } else if (choice.value === 'kiro') {
                    skillPaths.push(await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.kiro'));
                } else if (choice.value === 'cline') {
                    skillPaths.push(await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.cline'));
                } else if (choice.value === 'gemini') {
                    skillPaths.push(await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.gemini'));
                }
            }

            if (skillPaths.length === 0) { return { status: 'cancelled', projectRoot }; }

            const target = choices.map(c => c.value).join(', ');
            return { status: 'generated', target, projectRoot, skillPaths };
        }
    }

    private static getSkillContent(context: vscode.ExtensionContext, scriptRunPath: string): string {
        const templatePath = path.join(context.extensionPath, 'dist', 'skills', 'quickprompt', 'SKILL.md');
        const raw = fs.readFileSync(templatePath, 'utf-8');
        const body = raw.replace(/^---\n[\s\S]*?\n---\n\n?/, '');
        return body.replace(/\$\{scriptRunPath\}/g, scriptRunPath);
    }

    private static getQpBundleContent(context: vscode.ExtensionContext): string {
        const bundlePath = path.join(context.extensionPath, 'dist', 'qp.bundle.js');
        if (!fs.existsSync(bundlePath)) {
            throw new Error(`qp.bundle.js not found at ${bundlePath}. Run 'npm run build:qp' first.`);
        }
        return fs.readFileSync(bundlePath, 'utf-8');
    }

    private static async generateCursorRule(context: vscode.ExtensionContext, projectRoot: string, mcpServerPath: string): Promise<string> {
        const rulesDir = path.join(projectRoot, '.cursor', 'rules');
        const ruleFilePath = path.join(rulesDir, 'quickprompt.mdc');

        if (!fs.existsSync(rulesDir)) {
            fs.mkdirSync(rulesDir, { recursive: true });
        }

        const scriptsCursorDir = path.join(projectRoot, '.cursor', 'rules', 'scripts');
        if (!fs.existsSync(scriptsCursorDir)) {
            fs.mkdirSync(scriptsCursorDir, { recursive: true });
        }
        fs.writeFileSync(path.join(scriptsCursorDir, 'qp.bundle.js'), this.getQpBundleContent(context), 'utf-8');

        const scriptRunPath = '.cursor/rules/scripts/qp.bundle.js';
        const content = `---
description: "QuickPrompt - Prompt Management with Privacy & Version History"
globs: "*"
---
${this.getSkillContent(context, scriptRunPath)}`;

        fs.writeFileSync(ruleFilePath, content, 'utf8');
        vscode.window.showInformationMessage(`QuickPrompt skill file generated: .cursor/rules/quickprompt.mdc`);

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(ruleFilePath));
        await vscode.window.showTextDocument(document);

        return ruleFilePath;
    }

    private static async generateAgentSkill(
        context: vscode.ExtensionContext,
        projectRoot: string,
        mcpServerPath: string,
        agentType: '.agents' | '.claude' | '.github' | '.kiro' | '.cline' | '.gemini',
    ): Promise<string> {
        const skillsDir = path.join(projectRoot, agentType, 'skills', 'quickprompt');
        const mdPath = path.join(skillsDir, 'SKILL.md');

        if (!fs.existsSync(skillsDir)) {
            fs.mkdirSync(skillsDir, { recursive: true });
        }

        const skillScriptsDir = path.join(skillsDir, 'scripts');
        if (!fs.existsSync(skillScriptsDir)) {
            fs.mkdirSync(skillScriptsDir, { recursive: true });
        }
        fs.writeFileSync(path.join(skillScriptsDir, 'qp.bundle.js'), this.getQpBundleContent(context), 'utf-8');

        const scriptRunPath = agentType + '/skills/quickprompt/scripts/qp.bundle.js';
        const content = `---
name: quickprompt
description: Manages reusable prompts with version history and privacy masking via QuickPrompt MCP tools. Use this skill when the user wants to create, edit, search, or organize prompts, manage version history, tag milestones, or mask sensitive data in text content.
---

${this.getSkillContent(context, scriptRunPath)}`;

        fs.writeFileSync(mdPath, content, 'utf8');
        const relativeSkillPath = path.relative(projectRoot, mdPath).replace(/\\\\/g, '/');
        vscode.window.showInformationMessage(`QuickPrompt skill file generated: ${relativeSkillPath}`);

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(mdPath));
        await vscode.window.showTextDocument(document);

        return mdPath;
    }
}
