import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type SkillGenerationResult =
    | { status: 'generated'; target: string; projectRoot: string; skillPath: string }
    | { status: 'cancelled'; projectRoot: string }
    | { status: 'no_workspace' };

export class SkillGenerator {
    public static getProjectRoot(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        return workspaceFolders[0].uri.fsPath;
    }

    public static getMcpServerScriptPath(context: vscode.ExtensionContext): string {
        return path.join(context.extensionPath, 'dist', 'mcp', 'index.js').replace(/\\/g, '/');
    }

    public static async generateSkill(context: vscode.ExtensionContext): Promise<SkillGenerationResult> {
        const projectRoot = this.getProjectRoot();
        if (!projectRoot) {
            vscode.window.showErrorMessage('No workspace opened.');
            return { status: 'no_workspace' };
        }

        const options = [
            'Cursor (.cursor/rules/quickprompt.mdc)',
            'Antigravity (.agents/skills/quickprompt/SKILL.md)',
            'Claude Code (.claude/skills/quickprompt/SKILL.md)',
            'GitHub Copilot (.github/skills/quickprompt/SKILL.md)',
            'Kiro IDE (.kiro/skills/quickprompt/SKILL.md)',
            'Cline (.cline/skills/quickprompt/SKILL.md)'
        ];

        const choice = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select the AI agent to generate a skill file for',
        });

        if (!choice) {
            return { status: 'cancelled', projectRoot };
        }

        const mcpServerScriptPath = this.getMcpServerScriptPath(context);

        if (choice.includes('Cursor')) {
            const skillPath = await this.generateCursorRule(context, projectRoot, mcpServerScriptPath);
            return { status: 'generated', target: 'cursor', projectRoot, skillPath };
        } else if (choice.includes('Antigravity')) {
            const skillPath = await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.agents');
            return { status: 'generated', target: 'antigravity', projectRoot, skillPath };
        } else if (choice.includes('Claude')) {
            const skillPath = await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.claude');
            return { status: 'generated', target: 'claude', projectRoot, skillPath };
        } else if (choice.includes('GitHub Copilot')) {
            const skillPath = await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.github');
            return { status: 'generated', target: 'copilot', projectRoot, skillPath };
        } else if (choice.includes('Kiro IDE')) {
            const skillPath = await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.kiro');
            return { status: 'generated', target: 'kiro', projectRoot, skillPath };
        } else {
            const skillPath = await this.generateAgentSkill(context, projectRoot, mcpServerScriptPath, '.cline');
            return { status: 'generated', target: 'cline', projectRoot, skillPath };
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
        agentType: '.agents' | '.claude' | '.github' | '.kiro' | '.cline',
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
