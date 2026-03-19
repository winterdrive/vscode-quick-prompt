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

    private static getSkillContent(scriptRunPath: string): string {
        return `# QuickPrompt MCP Integration

This project uses QuickPrompt to manage reusable prompts with version history and privacy masking.

## MCP Server Setup

To configure the MCP server for your AI tool:
1. Open VS Code Command Palette (Ctrl+Shift+P)
2. Run: **QuickPrompt: Show MCP Config**
3. Follow the instructions for your specific AI tool

## Available Tools (21 total)

### Prompt Management (9 tools)

- \`list_prompts\`: List all prompts with summary info (id, title, use_count, pinned, created_at)
- \`get_prompt\`: Get a single prompt by ID with full content and metadata
- \`create_prompt\`: Create a new prompt with title and content
- \`edit_prompt\`: Edit title and/or content (auto-creates version history)
- \`delete_prompt\`: Delete a prompt and its version history
- \`toggle_pin\`: Toggle pinned state
- \`move_prompt\`: Move prompt up/down in display order
- \`search_prompts\`: Search by keyword across titles and content
- \`copy_prompt_content\`: Get content for clipboard use (increments use_count)

### Version History (7 tools)

- \`list_versions\`: List all versions for a prompt including milestones
- \`get_version\`: Get the content of a specific version
- \`apply_version\`: Restore prompt to a specific version (saves current as new version first)
- \`delete_version\`: Delete a version entry (cannot delete most recent)
- \`tag_milestone\`: Tag a version as a named milestone (protected from auto-pruning)
- \`rename_milestone\`: Rename an existing milestone
- \`remove_milestone\`: Remove milestone tag (keeps the version)

### Privacy Masking (5 tools)

- \`mask_text\`: Apply privacy masking (emails, phones, IPs, API keys, credit cards, SSNs, etc.)
- \`unmask_text\`: Reverse masking to restore original text
- \`list_dictionary\`: List custom privacy dictionary entries
- \`add_dictionary_entry\`: Add a custom word/phrase to the masking dictionary
- \`edit_dictionary_entry\`: Edit an existing dictionary entry
- \`delete_dictionary_entry\`: Delete a dictionary entry
- \`toggle_dictionary_entry\`: Enable/disable a dictionary entry

## ⚡ Action Decision Tree

> ❗ **MANDATORY**: Before performing ANY QuickPrompt operation, you MUST complete Layer 0 first.

### Layer 0: MCP Connection Gate — MUST PASS BEFORE ANY OTHER ACTION

Attempt to call \`list_prompts\` now.

**If \`list_prompts\` succeeds** → MCP is working. Proceed to Layer 1 immediately.

**If \`list_prompts\` fails ("Tool not found" / no response / timeout)**:

> 🛑 **STOP. DO NOT PROCEED. DO NOT edit any files.**
>
> You MUST output the following message to the user and then WAIT for their response before taking any further action:
>
> ---
> **QuickPrompt MCP server is not connected.**
> To enable full functionality, please:
> 1. Open VS Code Command Palette (Ctrl+Shift+P)
> 2. Run: **QuickPrompt: Show MCP Config**
> 3. Follow the setup instructions for your AI client
> 4. Restart your AI client after configuring
>
> Would you like me to proceed with the bundled CLI fallback instead (Level 3 Hard Fallback)?
> ---
>
> Only continue to Layer 2 / Layer 3 **if the user explicitly confirms they want the fallback**.

---

### Layer 1: Standard MCP Tools ✅ (Use whenever available)

Already listed above under "Available Tools". Always prefer these.

---

### Layer 2: Safety Verification 🛡️

(Currently QuickPrompt does not provide pure validation tools. Proceed directly to layer 1 or 3.)

---

### Layer 3: Hard Fallback CLI 🚨 (Last resort — only with explicit confirmation)

Only if MCP is non-functional AND the user has explicitly confirmed they want to proceed:

**Use the bundled CLI script**:
\`\`\`bash
# 1. Add a prompt
node ${scriptRunPath} add-prompt --title "My Title" --content "Prompt contents here"

# 2. List prompts
node ${scriptRunPath} list-prompts

# 3. Edit prompt (only need to provide title or content or both)
node ${scriptRunPath} edit-prompt 001 --content "New content"

# 4. Remove prompt
node ${scriptRunPath} remove-prompt 001
\`\`\`

---

## Behaviour Examples

### ✅ Example A: MCP available — list prompts

> **User**: 請幫我列出我目前有哪些常用的 prompt
>
> **Agent**: [calls \`list_prompts\`]
> "我幫您找出這些 prompt 囉..."

### 🛑 Example B: MCP not connected (correct HALT behaviour)

> **User**: 幫我把這個 prompt 複製出來
>
> **Agent** (discovers \`list_prompts\` is unavailable):
> "**QuickPrompt MCP server is not connected.**
> To enable full functionality, please:
> ...
> Would you like me to proceed with the bundled CLI fallback instead?"

### ⚠️ Example C: User chooses fallback after being informed

> **User** (after seeing Example B): 沒關係，你就用 CLI 降級執行吧。
>
> **Agent**: [runs \`node ${scriptRunPath} list-prompts\`]
> "已經透過 CLI 腳本為您直接存取資料囉。"
`;
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
${this.getSkillContent(scriptRunPath)}`;

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

${this.getSkillContent(scriptRunPath)}`;

        fs.writeFileSync(mdPath, content, 'utf8');
        const relativeSkillPath = path.relative(projectRoot, mdPath).replace(/\\\\/g, '/');
        vscode.window.showInformationMessage(`QuickPrompt skill file generated: ${relativeSkillPath}`);

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(mdPath));
        await vscode.window.showTextDocument(document);

        return mdPath;
    }
}
