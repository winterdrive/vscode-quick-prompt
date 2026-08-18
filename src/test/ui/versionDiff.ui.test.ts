import {
    ActivityBar,
    CustomTreeItem,
    CustomTreeSection,
    DiffEditor,
    EditorView,
    SideBarView,
    VSBrowser,
    ViewControl,
    Workbench,
} from 'vscode-extension-tester';
import { By, Key } from 'selenium-webdriver';
import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// PR #71 regression coverage ("dispose previous version-diff content provider
// before re-registering"): VS Code only allows a single TextDocumentContentProvider
// per URI scheme. The `prompt-history` scheme's provider used to be cleaned up
// solely via a 60s setTimeout, so viewing a version diff for a second prompt
// version within that window threw ("Failed to show version diff" error
// notification). The fix disposes the previous registration synchronously
// before registering the new one.
//
// src/test/unit/versionCommands.test.ts already exercises handleShowVersionDiff
// directly with fake timers. This spec instead drives the fix through real user
// interaction: expanding a prompt's version history in the tree and clicking
// through several historical versions back-to-back, with no artificial delay
// between clicks, then asserting no error toast appeared and each diff actually
// rendered the expected content.

interface PromptRecord {
    id: string;
    title: string;
    content: string;
    use_count: number;
    last_used: string;
    created_at: string;
    pinned: boolean;
    titleSource?: 'user' | 'ai';
    order?: number;
    meta?: {
        totalVersions: number;
        latestVersionId?: string;
    };
    ignorePrivacyWarning?: boolean;
}

interface SeedVersion {
    versionId: string;
    content: string;
    timestamp: number;
    changeType: 'create' | 'edit' | 'restore';
    milestone?: {
        label: string;
        createdAt: number;
    };
}

const PROMPT_ID = '9301';
const PROMPT_TITLE = 'UI VersionDiff Seed Prompt';

const CURRENT_CONTENT = 'Version diff UI test - current content.';
const ALPHA_LABEL = 'UI Diff Version Alpha';
const ALPHA_CONTENT = 'Version diff UI test - Alpha revision content.';
const BETA_LABEL = 'UI Diff Version Beta';
const BETA_CONTENT = 'Version diff UI test - Beta revision content.';
const GAMMA_LABEL = 'UI Diff Version Gamma';
const GAMMA_CONTENT = 'Version diff UI test - Gamma revision content.';

let workspaceRoot = '';
let vscodeDir = '';
let promptsPath = '';
let quickPromptDir = '';
let historyDir = '';
let historyFilePath = '';
let ownsWorkspaceRoot = false;

function createTestWorkspace(): void {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-prompt-ui-diff-'));
    ownsWorkspaceRoot = true;
    vscodeDir = path.join(workspaceRoot, '.vscode');
    promptsPath = path.join(vscodeDir, 'prompts.json');
    quickPromptDir = path.join(vscodeDir, '.quickprompt');
    historyDir = path.join(vscodeDir, '.quickprompt', 'history');
    historyFilePath = path.join(historyDir, `${PROMPT_ID}.history.json`);
}

function cleanupTestWorkspace(): void {
    if (!ownsWorkspaceRoot || !workspaceRoot) {
        return;
    }

    try {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    } catch {
        // VS Code may still hold a handle during shutdown on Windows.
    }
}

function seedWorkspaceData(): void {
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.mkdirSync(historyDir, { recursive: true });

    const now = Date.now();

    const seededPrompt: PromptRecord = {
        id: PROMPT_ID,
        title: PROMPT_TITLE,
        content: CURRENT_CONTENT,
        use_count: 0,
        last_used: '2026-05-20',
        created_at: '2026-05-20T00:00:00.000Z',
        pinned: false,
        titleSource: 'user',
        order: 0,
        meta: { totalVersions: 4, latestVersionId: 'v-current' },
        ignorePrivacyWarning: false,
    };
    fs.writeFileSync(promptsPath, JSON.stringify([seededPrompt], null, 2), 'utf8');

    // Ordered newest to oldest, matching VersionHistory's documented shape.
    const versions: SeedVersion[] = [
        { versionId: 'v-current', content: CURRENT_CONTENT, timestamp: now, changeType: 'edit' },
        {
            versionId: 'v-gamma',
            content: GAMMA_CONTENT,
            timestamp: now - 1000,
            changeType: 'edit',
            milestone: { label: GAMMA_LABEL, createdAt: now - 1000 },
        },
        {
            versionId: 'v-beta',
            content: BETA_CONTENT,
            timestamp: now - 2000,
            changeType: 'edit',
            milestone: { label: BETA_LABEL, createdAt: now - 2000 },
        },
        {
            versionId: 'v-alpha',
            content: ALPHA_CONTENT,
            timestamp: now - 3000,
            changeType: 'create',
            milestone: { label: ALPHA_LABEL, createdAt: now - 3000 },
        },
    ];

    const history = {
        promptId: PROMPT_ID,
        versions,
        currentVersionId: 'v-current',
    };
    fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), 'utf8');
}

let viewControl: ViewControl;

describe('Quick Prompt - Version Diff UI / E2E (PR #71 regression)', function () {
    this.timeout(120_000);

    before(async function () {
        createTestWorkspace();
        seedWorkspaceData();

        await VSBrowser.instance.waitForWorkbench();
        await VSBrowser.instance.openResources(workspaceRoot);
        await dismissOnboardingOverlay();

        // Wait for the extension host to fully stabilize before interacting
        const driver = VSBrowser.instance.driver;
        await driver.wait(async () => {
            try {
                const wb = await driver.findElement(By.css('.monaco-workbench'));
                return await wb.isDisplayed();
            } catch { return false; }
        }, 30_000, 'Monaco workbench did not appear');
        await driver.sleep(2000);

        const activityBar = new ActivityBar();
        let foundControl: ViewControl | undefined;
        for (let i = 0; i < 5; i++) {
            try {
                foundControl = await activityBar.getViewControl('Quick Prompt');
                if (foundControl) { break; }
            } catch { /* retry */ }
            await driver.sleep(1500);
        }
        expect(foundControl, 'Quick Prompt icon not found in Activity Bar').to.not.be.undefined;
        viewControl = foundControl!;
        await retryCommand('Refresh Prompts');
    });

    after(async function () {
        await closeQuickInput();
        try {
            await new EditorView().closeAllEditors();
        } catch {
            // A failed test can leave a modal dialog open. Browser shutdown will clean up the UI.
        }
        cleanupTestWorkspace();
    });

    it('views a version diff, then immediately views a different version diff, with no error notification and correct content each time', async function () {
        const sidebar = (await viewControl.openView()) as SideBarView;
        const section = await sidebar.getContent().getSection<CustomTreeSection>('Prompts');

        const promptItem = await waitForPromptTreeItem(section, PROMPT_TITLE);

        // Expand the prompt's version history and view the diff for "Alpha".
        await openVersionDiffAndVerify(promptItem, ALPHA_LABEL, ALPHA_CONTENT);

        // Immediately (no sleep, no artificial wait) view the diff for a
        // DIFFERENT version. Pre-fix, this threw because the previous
        // TextDocumentContentProvider registration for the 'prompt-history'
        // scheme was still pending its 60s cleanup timeout.
        await openVersionDiffAndVerify(promptItem, BETA_LABEL, BETA_CONTENT);
        await assertNoVersionDiffErrorToast();

        // Repeat once more against a third version to rule out a one-off
        // timing fluke rather than a genuine fix.
        await openVersionDiffAndVerify(promptItem, GAMMA_LABEL, GAMMA_CONTENT);
        await assertNoVersionDiffErrorToast();
    });
});

async function openVersionDiffAndVerify(
    promptItem: CustomTreeItem,
    versionLabel: string,
    expectedHistoricalContent: string
): Promise<void> {
    const versionItem = await waitForVersionTreeItem(promptItem, versionLabel);

    // Click the version row directly — this is exactly how a real user triggers
    // 'quickPrompt.showVersionDiff': VersionItem binds that command straight to
    // the row for any non-current version (see src/treeItems/VersionItem.ts).
    await versionItem.select();

    const diffTitle = `${versionLabel} ↔ Current Version`;
    const driver = VSBrowser.instance.driver;
    await driver.wait(async () => {
        const titles = await new EditorView().getOpenEditorTitles();
        return titles.some(title => title.includes(diffTitle));
    }, 15_000, `Diff editor titled "${diffTitle}" did not open`);

    const diffEditor = (await new EditorView().openEditor(diffTitle)) as DiffEditor;

    const originalEditor = await diffEditor.getOriginalEditor();
    const originalText = (await originalEditor.getText()).trim();
    expect(originalText, `Original (historical) side of "${diffTitle}" diff`).to.equal(expectedHistoricalContent);

    const modifiedEditor = await diffEditor.getModifiedEditor();
    const modifiedText = (await modifiedEditor.getText()).trim();
    expect(modifiedText, `Modified (current) side of "${diffTitle}" diff`).to.equal(CURRENT_CONTENT);
}

async function assertNoVersionDiffErrorToast(): Promise<void> {
    const driver = VSBrowser.instance.driver;
    const toasts = await driver.findElements(By.css('.notification-toast'));
    for (const toast of toasts) {
        try {
            const text = (await toast.getText()).toLowerCase();
            expect(text).to.not.include('failed to show version diff');
        } catch {
            // Toast may have already been dismissed while iterating; ignore.
        }
    }
}

async function waitForPromptTreeItem(section: CustomTreeSection, title: string): Promise<CustomTreeItem> {
    const driver = VSBrowser.instance.driver;
    let found: CustomTreeItem | undefined;

    await driver.wait(async () => {
        found = (await section.findItem(title)) as CustomTreeItem | undefined;
        return found !== undefined;
    }, 15_000, `Prompt row "${title}" did not appear in the Prompts view`);

    return found!;
}

async function waitForVersionTreeItem(promptItem: CustomTreeItem, labelSubstring: string): Promise<CustomTreeItem> {
    const driver = VSBrowser.instance.driver;
    let found: CustomTreeItem | undefined;

    await driver.wait(async () => {
        // getChildren() expands the prompt row if needed.
        const children = await promptItem.getChildren();
        for (const child of children) {
            const label = await (child as CustomTreeItem).getLabel();
            if (label.includes(labelSubstring)) {
                found = child as CustomTreeItem;
                return true;
            }
        }
        return false;
    }, 15_000, `Version row containing "${labelSubstring}" did not appear`);

    return found!;
}

async function dismissOnboardingOverlay(): Promise<void> {
    const driver = VSBrowser.instance.driver;
    try {
        const overlay = await driver.findElement(By.css('.onboarding-a-overlay.visible'));
        if (await overlay.isDisplayed()) {
            await driver.executeScript('arguments[0].remove()', overlay);
        }
    } catch {
        // Overlay is not present in most test runs.
    }
}

async function runCommandViaKeyboard(commandLabel: string): Promise<void> {
    await new Workbench().executeCommand(commandLabel);
}

async function retryCommand(commandLabel: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
        try {
            await closeQuickInput();
            await runCommandViaKeyboard(commandLabel);
            return;
        } catch {
            await VSBrowser.instance.driver.sleep(1500);
        }
    }
    await runCommandViaKeyboard(commandLabel);
}

async function closeQuickInput(): Promise<void> {
    const driver = VSBrowser.instance.driver;
    await resetKeyboardState();
    await driver.actions().sendKeys(Key.ESCAPE).perform();
    await driver.sleep(200);
}

async function resetKeyboardState(): Promise<void> {
    await VSBrowser.instance.driver.actions().sendKeys(Key.NULL).perform();
}
