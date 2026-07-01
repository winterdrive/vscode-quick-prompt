import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PromptProvider, PromptItem } from '../../promptProvider';
import { VersionHistoryService } from '../../services/VersionHistoryService';

describe('PromptProvider multi-root routing', () => {
    let tmpDir1: string;
    let tmpDir2: string;

    function makeWorkspace(name: string): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `qp-provider-${name}-`));
        fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
        return dir;
    }

    function writePrompts(root: string, prompts: unknown): void {
        fs.writeFileSync(
            path.join(root, '.vscode', 'prompts.json'),
            JSON.stringify(prompts, null, 2),
            'utf8'
        );
    }

    function makeContext(): vscode.ExtensionContext {
        const context = new (vscode as any).ExtensionContext();
        const state = new Map<string, unknown>();
        context.workspaceState = {
            get: jest.fn((key: string, defaultValue?: unknown) => state.has(key) ? state.get(key) : defaultValue),
            update: jest.fn((key: string, value: unknown) => {
                state.set(key, value);
                return Promise.resolve();
            }),
            keys: jest.fn(() => Array.from(state.keys()))
        };
        return context;
    }

    beforeEach(() => {
        tmpDir1 = makeWorkspace('projectA');
        tmpDir2 = makeWorkspace('projectB');
        (vscode.workspace as any).workspaceFolders = [
            { name: 'ProjectA', uri: vscode.Uri.file(tmpDir1) },
            { name: 'ProjectB', uri: vscode.Uri.file(tmpDir2) }
        ];
        (vscode.window as any).activeTextEditor = undefined;
        jest.clearAllMocks();
    });

    afterEach(() => {
        fs.rmSync(tmpDir1, { recursive: true, force: true });
        fs.rmSync(tmpDir2, { recursive: true, force: true });
        (vscode.workspace as any).workspaceFolders = undefined;
        (vscode.window as any).activeTextEditor = undefined;
    });

    it('stores version history in the prompt workspace instead of the first workspace', async () => {
        writePrompts(tmpDir1, [
            { id: '001', title: 'Prompt A', content: 'A', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);
        writePrompts(tmpDir2, [
            { id: '001', title: 'Prompt B', content: 'B', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);

        const context = makeContext();
        const versionHistoryService = new VersionHistoryService(context);
        const provider = new PromptProvider(context, versionHistoryService);
        await provider.refresh();

        const projectBPrompt = provider.getPrompts().find(p => p.title === 'Prompt B');
        expect(projectBPrompt).toBeDefined();

        await provider.updatePromptContent(projectBPrompt!.id, 'B updated');

        const projectAHistoryPath = path.join(tmpDir1, '.vscode', '.quickprompt', 'history', '001.history.json');
        const projectBHistoryPath = path.join(tmpDir2, '.vscode', '.quickprompt', 'history', '001.history.json');

        expect(fs.existsSync(projectAHistoryPath)).toBe(false);
        expect(fs.existsSync(projectBHistoryPath)).toBe(true);

        const history = JSON.parse(fs.readFileSync(projectBHistoryPath, 'utf8'));
        expect(history.promptId).toBe('001');
        expect(history.versions).toHaveLength(1);
        expect(history.versions[0].content).toBe('B updated');
    });

    it('does not overwrite a workspace whose prompts file failed to load', async () => {
        writePrompts(tmpDir1, [
            { id: '001', title: 'Prompt A', content: 'A', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);
        const invalidJsonPath = path.join(tmpDir2, '.vscode', 'prompts.json');
        fs.writeFileSync(invalidJsonPath, '{ invalid json', 'utf8');

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();

        const projectAPrompt = provider.getPrompts().find(p => p.title === 'Prompt A');
        expect(projectAPrompt).toBeDefined();

        await provider.togglePin(new PromptItem(projectAPrompt!));

        expect(fs.readFileSync(invalidJsonPath, 'utf8')).toBe('{ invalid json');
    });

    it('does not create prompts.json for empty workspaces until a prompt is added there', async () => {
        writePrompts(tmpDir1, [
            { id: '001', title: 'Prompt A', content: 'A', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);
        const missingPromptsPath = path.join(tmpDir2, '.vscode', 'prompts.json');

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();

        expect(fs.existsSync(missingPromptsPath)).toBe(false);

        const projectBKey = provider.getWorkspaceConfigs().find(config => config.name === 'ProjectB')?.key;
        expect(projectBKey).toBeDefined();

        await provider.addPromptWithOption('Prompt B', 'B', true, 'user', projectBKey);

        expect(fs.existsSync(missingPromptsPath)).toBe(true);
        const storedPrompts = JSON.parse(fs.readFileSync(missingPromptsPath, 'utf8'));
        expect(storedPrompts).toHaveLength(1);
        expect(storedPrompts[0].id).toBe('001');
    });

    it('shows a flat prompt list scoped to the default workspace in multi-root mode', async () => {
        writePrompts(tmpDir1, [
            { id: '001', title: 'Prompt A', content: 'A', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);
        writePrompts(tmpDir2, [
            { id: '001', title: 'Prompt B', content: 'B', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();

        const children = await provider.getChildren();
        expect(children).toHaveLength(1);
        expect(children[0]).toBeInstanceOf(PromptItem);
        expect((children[0] as PromptItem).prompt.title).toBe('Prompt A');
        expect(provider.getScopeDescription()).toBe('ProjectA');
        expect(provider.shouldShowWorkspaceLabels()).toBe(false);
    });

    it('can switch scope to all workspaces without adding workspace rows', async () => {
        writePrompts(tmpDir1, [
            { id: '001', title: 'Prompt A', content: 'A', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);
        writePrompts(tmpDir2, [
            { id: '001', title: 'Prompt B', content: 'B', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();
        await provider.setActiveWorkspaceScope([]);

        const children = await provider.getChildren();
        const promptItems = children.filter((child): child is PromptItem => child instanceof PromptItem);
        expect(promptItems.map(item => item.prompt.title).sort()).toEqual(['Prompt A', 'Prompt B']);
        expect(provider.getScopeDescription()).toBe('All Workspaces');
        expect(provider.shouldShowWorkspaceLabels()).toBe(true);
        expect(promptItems.some(item => String(item.tooltip).includes('Workspace: ProjectB'))).toBe(true);
    });

    it('can switch scope to a specific workspace', async () => {
        writePrompts(tmpDir1, [
            { id: '001', title: 'Prompt A', content: 'A', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);
        writePrompts(tmpDir2, [
            { id: '001', title: 'Prompt B', content: 'B', use_count: 0, last_used: '2026-06-23', created_at: '2026-06-23' }
        ]);

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();

        const projectBKey = provider.getWorkspaceConfigs().find(config => config.name === 'ProjectB')?.key;
        expect(projectBKey).toBeDefined();

        await provider.setActiveWorkspaceScope([projectBKey!]);

        const children = await provider.getChildren();
        expect(children).toHaveLength(1);
        expect((children[0] as PromptItem).prompt.title).toBe('Prompt B');
        expect(provider.getScopeDescription()).toBe('ProjectB');
        expect(provider.shouldShowWorkspaceLabels()).toBe(false);
    });

    it('uses the active editor workspace for quick-create target', async () => {
        writePrompts(tmpDir1, []);
        writePrompts(tmpDir2, []);

        (vscode.window as any).activeTextEditor = {
            document: { uri: vscode.Uri.file(path.join(tmpDir2, 'source.ts')) }
        };

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();

        const projectBKey = provider.getWorkspaceConfigs().find(config => config.name === 'ProjectB')?.key;
        expect(projectBKey).toBeDefined();
        expect(provider.getQuickCreateWorkspaceKey()).toBe(projectBKey);
    });

    it('uses a single selected scope for quick-create target when there is no active editor workspace', async () => {
        writePrompts(tmpDir1, []);
        writePrompts(tmpDir2, []);

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();

        const projectBKey = provider.getWorkspaceConfigs().find(config => config.name === 'ProjectB')?.key;
        expect(projectBKey).toBeDefined();

        await provider.setActiveWorkspaceScope([projectBKey!]);

        expect(provider.getQuickCreateWorkspaceKey()).toBe(projectBKey);
    });

    it('remembers the last create workspace when scope shows all workspaces', async () => {
        writePrompts(tmpDir1, []);
        writePrompts(tmpDir2, []);

        const context = makeContext();
        const provider = new PromptProvider(context, new VersionHistoryService(context));
        await provider.refresh();

        const projectBKey = provider.getWorkspaceConfigs().find(config => config.name === 'ProjectB')?.key;
        expect(projectBKey).toBeDefined();

        await provider.addPromptWithOption('Prompt B', 'B', true, 'user', projectBKey);
        await provider.setActiveWorkspaceScope([]);

        expect(provider.getQuickCreateWorkspaceKey()).toBe(projectBKey);
    });
});
