#!/usr/bin/env node
/**
 * qp-entry.ts — QuickPrompt CLI entry point
 *
 * Usage:
 *   node out/qp.bundle.js <command> [options]
 *
 * Commands:
 *   list-prompts
 *   get-prompt <id>
 *   add-prompt --title <title> --content <content>
 *   edit-prompt <id> [--title <title>] [--content <content>]
 *   remove-prompt <id>
 */

import * as fs from 'fs';
import * as path from 'path';
import { PromptManager } from './src/core/PromptManager';
import { VersionManager } from './src/core/VersionManager';

// ──────────────────────────────────────────────
// Utility functions
// ──────────────────────────────────────────────

function findWorkspaceRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, '.vscode'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return process.cwd();
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string>; positional: string[] } {
    const [,, command = '', ...rest] = argv;
    const flags: Record<string, string> = {};
    const positional: string[] = [];

    for (let i = 0; i < rest.length; i++) {
        if (rest[i].startsWith('--')) {
            const key = rest[i].slice(2);
            const val = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
            flags[key] = val;
        } else {
            positional.push(rest[i]);
        }
    }
    return { command, flags, positional };
}

// ──────────────────────────────────────────────
// Main program
// ──────────────────────────────────────────────

const { command, flags, positional } = parseArgs(process.argv);
const root = findWorkspaceRoot();
const pm = new PromptManager(root);
const vm = new VersionManager(root);

switch (command) {
    case 'list-prompts': {
        const prompts = pm.getPrompts();
        if (prompts.length === 0) {
            console.log('(no prompts)');
            break;
        }
        prompts.forEach(p => {
            console.log(`[${p.id}] ${p.title} - used ${p.use_count} times`);
        });
        break;
    }

    case 'get-prompt': {
        const id = positional[0];
        if (!id) {
            console.error('Error: please provide an ID, e.g., get-prompt 001');
            process.exit(1);
        }
        const prompt = pm.getPrompt(id);
        if (!prompt) {
            console.error(`Error: prompt "${id}" not found`);
            process.exit(1);
        }
        console.log(`Title: ${prompt.title}`);
        console.log(`Last Used: ${prompt.last_used}`);
        console.log(`---\\n${prompt.content}\\n---`);
        break;
    }

    case 'add-prompt': {
        const title = flags['title'];
        const content = flags['content'];
        if (!title || !content) {
            console.error('Error: please provide --title <title> and --content <content>');
            process.exit(1);
        }
        const newPrompt = pm.createPrompt(title, content);
        console.log(`Prompt added: ${title} (id=${newPrompt.id})`);
        break;
    }

    case 'edit-prompt': {
        const id = positional[0];
        if (!id) {
            console.error('Error: please provide an ID, e.g., edit-prompt 001');
            process.exit(1);
        }
        const title = flags['title'];
        const content = flags['content'];
        if (!title && !content) {
            console.error('Error: please provide --title <title> or --content <content>');
            process.exit(1);
        }
        try {
            pm.editPrompt(id, { title, content });
            console.log(`Prompt edited: (id=${id})`);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    case 'remove-prompt': {
        const id = positional[0];
        if (!id) {
            console.error('Error: please provide an ID, e.g., remove-prompt 001');
            process.exit(1);
        }
        const success = pm.deletePrompt(id);
        if (success) {
            console.log(`Prompt removed: ${id}`);
        } else {
            console.error(`Error: prompt "${id}" not found`);
            process.exit(1);
        }
        break;
    }

    // ──────────────────────────────────────────────
    // Version history commands
    // ──────────────────────────────────────────────

    case 'list-versions': {
        const promptId = flags['id'] || positional[0];
        if (!promptId) {
            console.error('Error: please provide --id <promptId>, e.g., list-versions --id 002');
            process.exit(1);
        }
        try {
            const { versions, currentVersionId } = vm.listVersions(promptId);
            if (versions.length === 0) {
                console.log(`(no versions for prompt ${promptId})`);
                break;
            }
            versions.forEach(v => {
                const isCurrent = v.versionId === currentVersionId ? '*' : ' ';
                const milestoneLabel = v.milestone ? ` [milestone: ${v.milestone.label}]` : '';
                const ts = new Date(v.timestamp).toISOString();
                console.log(`${isCurrent} ${v.versionId}  (${v.changeType} @ ${ts})${milestoneLabel}`);
            });
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    case 'show-version': {
        const promptId = flags['id'] || positional[0];
        const versionId = flags['version'] || positional[1];
        if (!promptId || !versionId) {
            console.error('Error: usage: show-version --id <promptId> --version <versionId>');
            process.exit(1);
        }
        try {
            const content = vm.getVersionContent(promptId, versionId);
            console.log(content);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    case 'show-current': {
        const promptId = flags['id'] || positional[0];
        if (!promptId) {
            console.error('Error: please provide --id <promptId>, e.g., show-current --id 002');
            process.exit(1);
        }
        try {
            const current = vm.getCurrentVersion(promptId);
            if (!current) {
                console.log(`(no current version for prompt ${promptId})`);
                break;
            }
            console.log(current.content);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    case 'apply-version': {
        const promptId = flags['id'] || positional[0];
        const versionId = flags['version'] || positional[1];
        if (!promptId || !versionId) {
            console.error('Error: usage: apply-version --id <promptId> --version <versionId>');
            process.exit(1);
        }
        try {
            const newVersion = vm.applyVersion(promptId, versionId);
            console.log(`Applied version ${versionId} as new version ${newVersion.versionId}`);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    case 'delete-version': {
        const promptId = flags['id'] || positional[0];
        const versionId = flags['version'] || positional[1];
        if (!promptId || !versionId) {
            console.error('Error: usage: delete-version --id <promptId> --version <versionId>');
            process.exit(1);
        }
        try {
            vm.deleteVersion(promptId, versionId);
            console.log(`Deleted version ${versionId} for prompt ${promptId}`);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    case 'tag-milestone': {
        const promptId = flags['id'] || positional[0];
        const versionId = flags['version'] || positional[1];
        const label = flags['label'] || positional[2];
        if (!promptId || !versionId || !label) {
            console.error('Error: usage: tag-milestone --id <promptId> --version <versionId> --label "<label>"');
            process.exit(1);
        }
        try {
            vm.tagMilestone(promptId, versionId, label);
            console.log(`Tagged version ${versionId} as milestone "${label}" for prompt ${promptId}`);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    case 'remove-milestone': {
        const promptId = flags['id'] || positional[0];
        const versionId = flags['version'] || positional[1];
        if (!promptId || !versionId) {
            console.error('Error: usage: remove-milestone --id <promptId> --version <versionId>');
            process.exit(1);
        }
        try {
            vm.removeMilestone(promptId, versionId);
            console.log(`Removed milestone from version ${versionId} for prompt ${promptId}`);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
        break;
    }

    default: {
        console.log(`
QuickPrompt CLI (qp)

Usage:
  node qp.bundle.js list-prompts
  node qp.bundle.js get-prompt <id>
  node qp.bundle.js add-prompt --title <title> --content <content>
  node qp.bundle.js edit-prompt <id> [--title <title>] [--content <content>]
  node qp.bundle.js remove-prompt <id>

  # Version history commands
  node qp.bundle.js list-versions --id <promptId>
  node qp.bundle.js show-version --id <promptId> --version <versionId>
  node qp.bundle.js show-current --id <promptId>
  node qp.bundle.js apply-version --id <promptId> --version <versionId>
  node qp.bundle.js delete-version --id <promptId> --version <versionId>
  node qp.bundle.js tag-milestone --id <promptId> --version <versionId> --label "<label>"
  node qp.bundle.js remove-milestone --id <promptId> --version <versionId>
        `.trim());
        break;
    }
}
