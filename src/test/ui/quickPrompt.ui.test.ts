import {
    ActivityBar,
    EditorView,
    SideBarView,
    TextEditor,
    ViewControl,
    VSBrowser,
    Workbench,
} from 'vscode-extension-tester';
import { By, Key, WebElement } from 'selenium-webdriver';
import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

let workspaceRoot = '';
let vscodeDir = '';
let promptsPath = '';
let quickPromptDir = '';
let historyDir = '';
let ownsWorkspaceRoot = false;

function createTestWorkspace(): void {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-prompt-ui-'));
    ownsWorkspaceRoot = true;
    vscodeDir = path.join(workspaceRoot, '.vscode');
    promptsPath = path.join(vscodeDir, 'prompts.json');
    quickPromptDir = path.join(vscodeDir, '.quickprompt');
    historyDir = path.join(vscodeDir, '.quickprompt', 'history');
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

const seededPrompts: PromptRecord[] = [
    {
        id: '9001',
        title: 'UI Seed Prompt',
        content: 'Seed content copied by the UI search test.',
        use_count: 0,
        last_used: '2026-05-20',
        created_at: '2026-05-20T00:00:00.000Z',
        pinned: false,
        titleSource: 'user',
        order: 0,
        meta: { totalVersions: 0, latestVersionId: '' },
        ignorePrivacyWarning: false,
    },
    {
        id: '9002',
        title: 'UI Second Prompt',
        content: 'Second prompt keeps the tree non-empty after mutations.',
        use_count: 0,
        last_used: '2026-05-20',
        created_at: '2026-05-20T00:00:01.000Z',
        pinned: false,
        titleSource: 'user',
        order: 1,
        meta: { totalVersions: 0, latestVersionId: '' },
        ignorePrivacyWarning: false,
    },
];

let viewControl: ViewControl;
let originalPromptsContent: string | undefined;
const originalHistoryFiles = new Map<string, string>();
let originalQuickPromptDirExisted = false;
let originalHistoryDirExisted = false;

describe('Quick Prompt - UI / E2E', function () {
    this.timeout(120_000);

    before(async function () {
        createTestWorkspace();
        backupWorkspaceData();
        seedWorkspaceData();

        await VSBrowser.instance.waitForWorkbench();
        await VSBrowser.instance.openResources(workspaceRoot);
        await dismissOnboardingOverlay();

        const activityBar = new ActivityBar();
        const foundControl = await activityBar.getViewControl('Quick Prompt');
        expect(foundControl, 'Quick Prompt icon not found in Activity Bar').to.not.be.undefined;
        viewControl = foundControl!;
        await runCommandViaKeyboard('Refresh Prompts');
    });

    after(async function () {
        await closeQuickInput();
        try {
            await new EditorView().closeAllEditors();
        } catch {
            // A failed test can leave a modal dialog open. Browser shutdown will clean up the UI.
        }
        restoreWorkspaceData();
        cleanupTestWorkspace();
    });

    it('shows the Quick Prompt container and expected view sections', async function () {
        expect(await viewControl.getTitle()).to.equal('Quick Prompt');

        const sidebar = (await viewControl.openView()) as SideBarView;
        const title = await sidebar.getTitlePart().getTitle();
        expect(title.toLowerCase()).to.include('quick prompt');

        const sections = await sidebar.getContent().getSections();
        const titles = await Promise.all(sections.map(s => s.getTitle()));
        expect(titles.some(t => /prompt/i.test(t))).to.be.true;
        expect(titles.some(t => /clipboard/i.test(t))).to.be.true;

        const seededRow = await waitForWorkbenchText('UI Seed Prompt');
        expect(seededRow).to.include('UI Seed Prompt');
    });

    it('exposes the primary Quick Prompt commands in the command palette', async function () {
        await openCommandPalette();

        for (const command of [
            'Search Prompts',
            'Add Prompt (Auto Title)',
            'Add Prompt (Custom Title)',
            'Quick Add Prompt (Selection)',
            'Show MCP Config',
            'Generate Skill File',
        ]) {
            await replaceQuickInputText(`>${command}`);
            const rowText = await waitForQuickPickRow(command);
            expect(rowText.toLowerCase()).to.include(command.toLowerCase());
        }

        await closeQuickInput();
    });

    it('searches prompts, copies the selected prompt, and increments usage count', async function () {
        await runCommandViaKeyboard('Search Prompts');
        await replaceQuickInputText('UI Seed Prompt');
        await waitForQuickPickRow('UI Seed Prompt');
        await acceptQuickInput();

        await waitForPromptRecord('9001', prompt => prompt.use_count === 1);
    });

    it('opens an existing prompt from the tree and persists virtual-editor edits', async function () {
        const editedContent = uniqueMarker('tree-editor-sync-content');

        await viewControl.openView();
        await clickWorkbenchText('UI Seed Prompt');

        const activeTab = await new EditorView().getActiveTab();
        expect(await activeTab?.getTitle()).to.equal('9001.md');

        const editor = new TextEditor();
        await editor.setText(editedContent);
        await editor.save();

        await waitForPromptRecord('9001', prompt => prompt.content === editedContent);
        const history = await waitForVersionHistory('9001');
        expect(history.versions.some(version => version.content === editedContent)).to.be.true;
    });

    it('Add Prompt (Auto Title) opens a virtual editor and persists saved content', async function () {
        const marker = uniqueMarker('auto-editor-content');

        await runCommandViaKeyboard('Add Prompt (Auto Title)');
        const activeEditor = new TextEditor();
        await activeEditor.setText(marker);
        await activeEditor.save();

        const persistedPrompt = await waitForPromptRecord(undefined, prompt =>
            prompt.titleSource === 'ai' &&
            prompt.content.includes(marker) &&
            (prompt.meta?.totalVersions ?? 0) > 0
        );
        const history = await waitForVersionHistory(persistedPrompt.id);
        expect(history.versions.some(version => version.content.includes(marker))).to.be.true;

        const activeTab = await new EditorView().getActiveTab();
        expect(await activeTab?.getTitle()).to.equal(`${persistedPrompt.id}.md`);
    });

    it('Add Prompt (Custom Title) creates a prompt from the two input boxes', async function () {
        const title = uniqueMarker('custom-title');
        const content = uniqueMarker('custom-content');

        await runCommandViaKeyboard('Add Prompt (Custom Title)');
        await replaceQuickInputText(title);
        await acceptQuickInput();
        await replaceQuickInputText(content);
        await acceptQuickInput();

        await waitForPromptRecord(undefined, prompt =>
            prompt.title === title &&
            prompt.content === content &&
            prompt.titleSource === 'user'
        );
    });

    it('Quick Add Prompt (Selection) saves the active editor selection', async function () {
        const selectedText = uniqueMarker('selection-capture-content');

        await new EditorView().closeAllEditors();
        await new Workbench().executeCommand('File: New Text File');
        const editor = new TextEditor();
        await editor.setText(selectedText);
        await new Workbench().executeCommand('Select All');

        await runCommandViaKeyboard('Quick Add Prompt (Selection)');

        await waitForPromptRecord(undefined, prompt =>
            prompt.content === selectedText &&
            prompt.titleSource === 'ai'
        );
    });

    it('Show MCP Config opens the MCP configuration webview editor', async function () {
        await runCommandViaKeyboard('Show MCP Config');

        const driver = VSBrowser.instance.driver;
        await driver.wait(async () => {
            const titles = await new EditorView().getOpenEditorTitles();
            return titles.some(title => title.includes('QuickPrompt MCP Config'));
        }, 10_000, 'MCP config editor did not open');
    });

    it('Refresh Clipboard History command shows a toast notification', async function () {
        await runCommandViaKeyboard('Refresh Clipboard History');

        const driver = VSBrowser.instance.driver;
        await driver.wait(async () => {
            try {
                const toasts = await driver.findElements(By.css('.notification-toast'));
                for (const toast of toasts) {
                    const text = (await toast.getText()).toLowerCase();
                    if (text.includes('clipboard')) {
                        return true;
                    }
                }
            } catch {
                // DOM may be re-rendering
            }
            return false;
        }, 10_000, 'Clipboard refresh toast notification did not appear');
    });

    it('Refresh Clipboard History adds copied editor text to the history panel', async function () {
        const uniqueContent = `ui-test-clipboard-refresh-${Date.now()}`;

        // Write unique content to a new editor and copy it to system clipboard
        await new EditorView().closeAllEditors();
        await new Workbench().executeCommand('File: New Text File');
        const editor = new TextEditor();
        await editor.setText(uniqueContent);
        await new Workbench().executeCommand('Select All');
        await new Workbench().executeCommand('Copy');

        // Trigger refresh so the extension picks up the new clipboard content
        await runCommandViaKeyboard('Refresh Clipboard History');

        // Verify the content appears in the Clipboard History panel
        const rowText = await waitForWorkbenchText(uniqueContent.substring(0, 20));
        expect(rowText).to.include(uniqueContent.substring(0, 20));
    });
});

function backupWorkspaceData(): void {
    originalPromptsContent = fs.existsSync(promptsPath)
        ? fs.readFileSync(promptsPath, 'utf8')
        : undefined;

    originalQuickPromptDirExisted = fs.existsSync(quickPromptDir);
    originalHistoryDirExisted = fs.existsSync(historyDir);
    originalHistoryFiles.clear();
    if (!originalHistoryDirExisted) {
        return;
    }

    for (const entry of fs.readdirSync(historyDir, { withFileTypes: true })) {
        if (entry.isFile()) {
            const historyPath = path.join(historyDir, entry.name);
            originalHistoryFiles.set(historyPath, fs.readFileSync(historyPath, 'utf8'));
        }
    }
}

function seedWorkspaceData(): void {
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(promptsPath, JSON.stringify(seededPrompts, null, 2), 'utf8');

    for (const entry of fs.readdirSync(historyDir, { withFileTypes: true })) {
        if (entry.isFile()) {
            fs.rmSync(path.join(historyDir, entry.name));
        }
    }
}

function restoreWorkspaceData(): void {
    if (originalPromptsContent === undefined) {
        if (fs.existsSync(promptsPath)) {
            fs.rmSync(promptsPath);
        }
    } else {
        fs.mkdirSync(vscodeDir, { recursive: true });
        fs.writeFileSync(promptsPath, originalPromptsContent, 'utf8');
    }

    if (fs.existsSync(historyDir)) {
        for (const entry of fs.readdirSync(historyDir, { withFileTypes: true })) {
            if (entry.isFile()) {
                fs.rmSync(path.join(historyDir, entry.name));
            }
        }
    }

    if (originalHistoryDirExisted) {
        fs.mkdirSync(historyDir, { recursive: true });
        for (const [historyPath, content] of originalHistoryFiles) {
            fs.writeFileSync(historyPath, content, 'utf8');
        }
    } else if (fs.existsSync(historyDir)) {
        fs.rmSync(historyDir, { recursive: true, force: true });
    }

    if (!originalQuickPromptDirExisted && fs.existsSync(quickPromptDir) && fs.readdirSync(quickPromptDir).length === 0) {
        fs.rmSync(quickPromptDir, { recursive: true, force: true });
    }
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

async function openCommandPalette(): Promise<void> {
    const driver = VSBrowser.instance.driver;

    await closeQuickInput();
    await driver.actions()
        .keyDown(Key.CONTROL)
        .keyDown(Key.SHIFT)
        .sendKeys('p')
        .keyUp(Key.SHIFT)
        .keyUp(Key.CONTROL)
        .perform();

    await waitForQuickInput();
}

async function waitForQuickInput(): Promise<WebElement> {
    const driver = VSBrowser.instance.driver;
    const widget = await driver.wait(async () => {
        try {
            const widget = await driver.findElement(By.css('.quick-input-widget'));
            return await widget.isDisplayed() ? widget : false;
        } catch {
            return false;
        }
    }, 10_000, 'Quick input did not appear');

    return widget as WebElement;
}

async function replaceQuickInputText(text: string): Promise<void> {
    const driver = VSBrowser.instance.driver;
    await waitForQuickInput();
    await resetKeyboardState();
    await driver.actions()
        .keyDown(Key.CONTROL)
        .sendKeys('a')
        .keyUp(Key.CONTROL)
        .perform();
    await driver.sleep(50);
    await driver.actions().sendKeys(text).perform();
    await resetKeyboardState();
}

async function waitForQuickPickRow(expectedText: string): Promise<string> {
    const driver = VSBrowser.instance.driver;

    const matchedText = await driver.wait(async () => {
        const rows = await driver.findElements(By.css('.quick-input-list .monaco-list-row'));
        for (const row of rows) {
            try {
                const text = (await row.getText()).trim();
                if (text.toLowerCase().includes(expectedText.toLowerCase())) {
                    return text;
                }
            } catch {
                // Rows can be re-rendered while filtering.
            }
        }
        return false;
    }, 10_000, `Quick pick row "${expectedText}" did not appear`);

    return matchedText as string;
}

async function waitForWorkbenchText(expectedText: string): Promise<string> {
    const driver = VSBrowser.instance.driver;

    const matchedText = await driver.wait(async () => {
        const rows = await driver.findElements(By.css('.monaco-list-row'));
        for (const row of rows) {
            try {
                const text = (await row.getText()).trim();
                if (text.toLowerCase().includes(expectedText.toLowerCase())) {
                    return text;
                }
            } catch {
                // Tree rows can be re-rendered while the extension refreshes.
            }
        }
        return false;
    }, 10_000, `Workbench row "${expectedText}" did not appear`);

    return matchedText as string;
}

async function clickWorkbenchText(expectedText: string): Promise<void> {
    const driver = VSBrowser.instance.driver;

    const matchedRow = await driver.wait(async () => {
        const rows = await driver.findElements(By.css('.monaco-list-row'));
        for (const row of rows) {
            try {
                const text = (await row.getText()).trim();
                if (text.toLowerCase().includes(expectedText.toLowerCase())) {
                    return row;
                }
            } catch {
                // Tree rows can be re-rendered while the extension refreshes.
            }
        }
        return false;
    }, 10_000, `Workbench row "${expectedText}" did not appear`);

    await (matchedRow as WebElement).click();
}

async function acceptQuickInput(): Promise<void> {
    await resetKeyboardState();
    await VSBrowser.instance.driver.actions().sendKeys(Key.ENTER).perform();
    await resetKeyboardState();
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

function readPromptsFile(): PromptRecord[] {
    return JSON.parse(fs.readFileSync(promptsPath, 'utf8')) as PromptRecord[];
}

async function waitForPromptRecord(
    id: string | undefined,
    predicate: (prompt: PromptRecord) => boolean
): Promise<PromptRecord> {
    const driver = VSBrowser.instance.driver;

    const promptRecord = await driver.wait(() => {
        const prompts = readPromptsFile();
        const found = prompts.find(prompt =>
            (id === undefined || prompt.id === id) &&
            predicate(prompt)
        );
        return found || false;
    }, 10_000, 'Expected prompt record was not persisted');

    return promptRecord as PromptRecord;
}

async function waitForVersionHistory(promptId: string): Promise<{ versions: Array<{ content: string }> }> {
    const driver = VSBrowser.instance.driver;
    const historyPath = path.join(historyDir, `${promptId}.history.json`);

    const history = await driver.wait(() => {
        if (!fs.existsSync(historyPath)) {
            return false;
        }

        const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        return Array.isArray(parsed.versions) && parsed.versions.length > 0
            ? parsed
            : false;
    }, 10_000, 'Expected version history file was not persisted');

    return history as { versions: Array<{ content: string }> };
}

function uniqueMarker(prefix: string): string {
    return `ui-test-${prefix}-${Date.now()}`;
}
