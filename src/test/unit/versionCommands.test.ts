import * as vscode from 'vscode';
import { handleShowVersionDiff } from '../../commands/versionCommands';
import { VersionItem } from '../../treeItems/VersionItem';
import { VersionHistoryService } from '../../services/VersionHistoryService';
import { VersionHistory, PromptVersion } from '../../types/versionHistory';

// PR #71 regression coverage: VS Code only allows a single
// TextDocumentContentProvider per URI scheme ('prompt-history' here). The
// pre-fix code relied solely on a 60s setTimeout to dispose the previous
// registration, so opening a second version diff within that window threw.
// The fix disposes the previous registration synchronously before
// registering the new one, and guards the delayed cleanup so it never
// double-disposes a registration that was already replaced.
describe('handleShowVersionDiff (PR #71 dispose-before-register regression)', () => {
    function makeVersion(versionId: string, content: string): PromptVersion {
        return {
            versionId,
            content,
            timestamp: Date.now(),
            changeType: 'edit',
        };
    }

    function makeItem(promptId: string, version: PromptVersion): VersionItem {
        return { promptId, version, isCurrent: false } as unknown as VersionItem;
    }

    function makeService(history: VersionHistory): VersionHistoryService {
        return {
            loadHistory: jest.fn().mockResolvedValue(history),
        } as unknown as VersionHistoryService;
    }

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('disposes the previous registration before registering the next one, and never throws on the second call', async () => {
        const versionA = makeVersion('v1', 'content A');
        const versionB = makeVersion('v2', 'content B');
        const current = makeVersion('current', 'current content');
        const history: VersionHistory = {
            promptId: 'p1',
            versions: [versionA, versionB, current],
            currentVersionId: 'current',
        };
        const service = makeService(history);

        const registerSpy = jest.spyOn(vscode.workspace, 'registerTextDocumentContentProvider');

        // First call registers a provider for the 'prompt-history' scheme.
        await handleShowVersionDiff(makeItem('p1', versionA), service);
        expect(registerSpy).toHaveBeenCalledTimes(1);
        const firstRegistration = registerSpy.mock.results[0].value as vscode.Disposable;
        const firstDisposeSpy = jest.spyOn(firstRegistration, 'dispose');

        // Second call must not throw even though only one 'prompt-history'
        // provider may be registered at a time (mock enforces this like real VS Code).
        await expect(
            handleShowVersionDiff(makeItem('p1', versionB), service)
        ).resolves.not.toThrow();

        expect(registerSpy).toHaveBeenCalledTimes(2);
        // The previous registration's dispose() must have been called before
        // the second registerTextDocumentContentProvider call succeeded.
        expect(firstDisposeSpy).toHaveBeenCalledTimes(1);

        const secondRegistration = registerSpy.mock.results[1].value as vscode.Disposable;
        const secondDisposeSpy = jest.spyOn(secondRegistration, 'dispose');

        // Fast-forward past the delayed cleanup (60s) for both calls. The
        // first registration's guarded timeout must not double-dispose it,
        // and the second registration's timeout should dispose it exactly once.
        jest.advanceTimersByTime(60000);

        expect(firstDisposeSpy).toHaveBeenCalledTimes(1);
        expect(secondDisposeSpy).toHaveBeenCalledTimes(1);

        registerSpy.mockRestore();
    });

    it('does not error when no error message is shown for the second diff', async () => {
        const versionA = makeVersion('v1', 'content A');
        const versionB = makeVersion('v2', 'content B');
        const current = makeVersion('current', 'current content');
        const history: VersionHistory = {
            promptId: 'p1',
            versions: [versionA, versionB, current],
            currentVersionId: 'current',
        };
        const service = makeService(history);
        const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

        await handleShowVersionDiff(makeItem('p1', versionA), service);
        await handleShowVersionDiff(makeItem('p1', versionB), service);

        expect(errorSpy).not.toHaveBeenCalled();
    });
});
