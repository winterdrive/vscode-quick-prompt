import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { PromptManager } from '../../core/PromptManager';
import { VersionManager } from '../../core/VersionManager';
import { PromptTools } from '../../../mcp-server/src/tools/promptTools';
import { VersionTools } from '../../../mcp-server/src/tools/versionTools';
import { ErrorType } from '../../../mcp-server/src/types';
import type { WorkspaceBinding } from '../../../mcp-server/src/workspaceTypes';

describe('Multi-root Workspace Integration', () => {
    let tmpDir1: string;
    let tmpDir2: string;
    let pm1: PromptManager;
    let pm2: PromptManager;
    let vm1: VersionManager;
    let vm2: VersionManager;
    let promptTools: PromptTools;
    let versionTools: VersionTools;

    function makeWorkspace(name: string): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pm-multiroot-${name}-`));
        fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
        return dir;
    }

    function workspaceId(uri: string): string {
        return Buffer.from(uri, 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function bindWorkspace(name: string, rootPath: string, promptManager: PromptManager, versionManager: VersionManager): WorkspaceBinding {
        const uri = pathToFileURL(rootPath).href;
        return {
            id: workspaceId(uri),
            name,
            uri,
            rootPath,
            promptManager,
            versionManager
        };
    }

    beforeEach(() => {
        tmpDir1 = makeWorkspace('projectA');
        tmpDir2 = makeWorkspace('projectB');

        pm1 = new PromptManager(tmpDir1);
        pm2 = new PromptManager(tmpDir2);
        vm1 = new VersionManager(tmpDir1);
        vm2 = new VersionManager(tmpDir2);

        // 模擬 QuickPromptMCPServer 中的 getWorkspace 與 getAllWorkspaces 輔助方法
        const workspaces = [
            bindWorkspace('ProjectA', tmpDir1, pm1, vm1),
            bindWorkspace('ProjectB', tmpDir2, pm2, vm2)
        ];

        const getWorkspace = (name?: string) => {
            const target = name || workspaces[0].id;
            return workspaces.find(ws =>
                ws.id === target ||
                ws.name === target ||
                ws.uri === target ||
                ws.rootPath === target
            );
        };

        const getAllWorkspaces = () => {
            return workspaces;
        };

        promptTools = new PromptTools(getWorkspace, getAllWorkspaces);
        versionTools = new VersionTools(getWorkspace);
    });

    afterEach(() => {
        fs.rmSync(tmpDir1, { recursive: true, force: true });
        fs.rmSync(tmpDir2, { recursive: true, force: true });
    });

    it('should list prompts from all workspaces with workspace-prefixed IDs', async () => {
        // 在工作區 A 建立一個 prompt
        const resCreate1 = await promptTools.createPrompt({
            title: 'Prompt A',
            content: 'Content A',
            workspace: 'ProjectA'
        });
        expect(resCreate1.success).toBe(true);
        
        // 在工作區 B 建立一個 prompt
        const resCreate2 = await promptTools.createPrompt({
            title: 'Prompt B',
            content: 'Content B',
            workspace: 'ProjectB'
        });
        expect(resCreate2.success).toBe(true);

        // 列出所有 prompts，應包含這兩個，且 ID 為 ProjectA:001 與 ProjectB:001
        const resList = await promptTools.listPrompts();
        expect(resList.success).toBe(true);
        const data = (resList as any).data;
        expect(data.total).toBe(2);

        const pA = data.prompts.find((p: any) => p.workspace === 'ProjectA');
        const pB = data.prompts.find((p: any) => p.workspace === 'ProjectB');
        
        expect(pA).toBeDefined();
        expect(pA.id).toBe('ProjectA:001');
        expect(pA.title).toBe('Prompt A');
        expect(pA.workspaceId).toBeDefined();
        expect(pA.workspaceUri).toContain('file://');

        expect(pB).toBeDefined();
        expect(pB.id).toBe('ProjectB:001');
        expect(pB.title).toBe('Prompt B');
        expect(pB.workspaceId).toBeDefined();
        expect(pB.workspaceUri).toContain('file://');
    });

    it('should edit prompt and create version in correct workspace', async () => {
        // 在 ProjectA 建立
        await promptTools.createPrompt({
            title: 'Orig Title',
            content: 'Orig Content',
            workspace: 'ProjectA'
        });

        // 編輯，ID 為 ProjectA:001
        const resEdit = await promptTools.editPrompt({
            id: 'ProjectA:001',
            title: 'New Title',
            content: 'New Content'
        });
        expect(resEdit.success).toBe(true);

        // 驗證 ProjectA 有被修改，而 ProjectB 沒有受影響
        const pA = pm1.getPrompt('001');
        expect(pA?.title).toBe('New Title');
        expect(pA?.content).toBe('New Content');

        // 驗證版本歷史在 ProjectA 中已建立
        const { versions } = vm1.listVersions('001');
        expect(versions.length).toBe(2); // create + edit
    });

    it('should fail with error if workspace prefix is missing in tool operations', async () => {
        const resGet = await promptTools.getPrompt({ id: '001' });
        expect(resGet.success).toBe(false);
        expect((resGet as any).message).toContain('prefixed with workspace name');
    });

    it('should fail with error if specified workspace is invalid', async () => {
        const resCreate = await promptTools.createPrompt({
            title: 'T',
            content: 'C',
            workspace: 'InvalidProject'
        });
        expect(resCreate.success).toBe(false);
        expect((resCreate as any).error).toBe(ErrorType.NOT_FOUND);
    });

    it('should return a usable primary workspace ID when workspace is omitted on create', async () => {
        const resCreate = await promptTools.createPrompt({
            title: 'Default Prompt',
            content: 'Default Content'
        });
        expect(resCreate.success).toBe(true);
        expect((resCreate as any).data.id).toBe('ProjectA:001');

        const resGet = await promptTools.getPrompt({ id: (resCreate as any).data.id });
        expect(resGet.success).toBe(true);
        expect((resGet as any).data.title).toBe('Default Prompt');

        const resEdit = await promptTools.editPrompt({
            id: (resCreate as any).data.id,
            content: 'Updated Default Content'
        });
        expect(resEdit.success).toBe(true);
        expect((resEdit as any).data.id).toBe('ProjectA:001');
        expect(pm1.getPrompt('001')?.content).toBe('Updated Default Content');
    });

    it('should route version operations correctly', async () => {
        const resCreate = await promptTools.createPrompt({
            title: 'T',
            content: 'C',
            workspace: 'ProjectB'
        });
        const wrappedId = (resCreate as any).data.id; // ProjectB:001

        const resListVersions = await versionTools.listVersions({ promptId: wrappedId });
        expect(resListVersions.success).toBe(true);
        expect((resListVersions as any).data.versions.length).toBe(1); // 只有 create 版本
    });

    it('should route by stable workspaceId when provided', async () => {
        await promptTools.createPrompt({
            title: 'Prompt A',
            content: 'Content A',
            workspace: 'ProjectA'
        });
        const resCreateB = await promptTools.createPrompt({
            title: 'Prompt B',
            content: 'Content B',
            workspace: 'ProjectB'
        });
        expect(resCreateB.success).toBe(true);

        const projectBWorkspaceId = (resCreateB as any).data.workspaceId;
        const resEdit = await promptTools.editPrompt({
            id: 'ProjectA:001',
            workspaceId: projectBWorkspaceId,
            content: 'Updated B via stable workspace id'
        });

        expect(resEdit.success).toBe(true);
        expect((resEdit as any).data.id).toBe('ProjectB:001');
        expect(pm1.getPrompt('001')?.content).toBe('Content A');
        expect(pm2.getPrompt('001')?.content).toBe('Updated B via stable workspace id');
    });
});
