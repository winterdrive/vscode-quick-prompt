import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { VersionHistoryService } from '../../services/VersionHistoryService';

describe('VersionHistoryService', () => {
    let tmpDir: string;
    let historyDir: string;
    let service: VersionHistoryService;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-test-'));
        (vscode.workspace as any).workspaceFolders = [{ uri: vscode.Uri.file(tmpDir), name: 'test' }];
        historyDir = path.join(tmpDir, '.vscode', '.quickprompt', 'history');
        service = new VersionHistoryService(new (vscode as any).ExtensionContext());
    });

    afterEach(() => {
        (vscode.workspace as any).workspaceFolders = undefined;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('loadHistory', () => {
        it('returns empty history when the file does not exist', async () => {
            const history = await service.loadHistory('abc');
            expect(history).toEqual({ promptId: 'abc', versions: [], currentVersionId: '' });
        });

        it('loads valid persisted history', async () => {
            fs.mkdirSync(historyDir, { recursive: true });
            const stored = {
                promptId: 'abc',
                versions: [{ versionId: 'v1', content: 'hi', timestamp: 1, changeType: 'create' }],
                currentVersionId: 'v1'
            };
            fs.writeFileSync(path.join(historyDir, 'abc.history.json'), JSON.stringify(stored), 'utf-8');

            const history = await service.loadHistory('abc');
            expect(history.versions).toHaveLength(1);
            expect(history.currentVersionId).toBe('v1');
        });

        it('resets to empty history when the file contains corrupted JSON', async () => {
            fs.mkdirSync(historyDir, { recursive: true });
            fs.writeFileSync(path.join(historyDir, 'abc.history.json'), '{not valid json', 'utf-8');

            const history = await service.loadHistory('abc');
            expect(history).toEqual({ promptId: 'abc', versions: [], currentVersionId: '' });
        });

        it('resets to empty history when the file contains JSON of the wrong shape', async () => {
            fs.mkdirSync(historyDir, { recursive: true });
            fs.writeFileSync(path.join(historyDir, 'abc.history.json'), JSON.stringify([1, 2, 3]), 'utf-8');

            const history = await service.loadHistory('abc');
            expect(history).toEqual({ promptId: 'abc', versions: [], currentVersionId: '' });
        });
    });
});
