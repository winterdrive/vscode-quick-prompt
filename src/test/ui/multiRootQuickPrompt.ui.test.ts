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
    meta?: {
        totalVersions: number;
        latestVersionId?: string;
    };
}

let parentRoot = '';
let workspaceA = '';
let workspaceB = '';
let workspaceFile = '';
let fileInWorkspaceB = '';
let viewControl: ViewControl;

describe('Quick Prompt - Multi-root UI / E2E', function () {
    this.timeout(120_000);

    before(async function () {
        createMultiRootFixture();

        await VSBrowser.instance.waitForWorkbench();
        await closeQuickInput();
        await closeAllEditors();
        await VSBrowser.instance.openResources(workspaceFile);
        await dismissOnboardingOverlay();
        await waitForWorkbench();

        const activityBar = new ActivityBar();
        let foundControl: ViewControl | undefined;
        for (let i = 0; i < 5; i++) {
            try {
                foundControl = await activityBar.getViewControl('Quick Prompt');
                if (foundControl) { break; }
            } catch {
                // Retry while extension host is activating.
            }
            await VSBrowser.instance.driver.sleep(1500);
        }

        expect(foundControl, 'Quick Prompt icon not found in Activity Bar').to.not.be.undefined;
        viewControl = foundControl!;
        await retryCommand('Refresh Prompts');
    });

    after(async function () {
        await closeQuickInput();
        await closeAllEditors();
        cleanupMultiRootFixture();
    });

    it('renders a flat prompt list for the default workspace scope', async function () {
        const sidebar = (await viewControl.openView()) as SideBarView;
        const title = await sidebar.getTitlePart().getTitle();
        expect(title.toLowerCase()).to.include('quick prompt');

        expect(await waitForWorkbenchText('MR Prompt A')).to.include('MR Prompt A');

        const rowsText = await getWorkbenchRowsText();
        expect(rowsText).to.not.include(path.basename(workspaceA));
        expect(rowsText).to.not.include(path.basename(workspaceB));
        expect(rowsText).to.not.include('MR Prompt B');
    });

    it('searches within the active workspace scope', async function () {
        await closeQuickInput();
        await runCommandViaKeyboard('Search Prompts');
        await replaceQuickInputText('MR Prompt A');

        const rowText = await waitForQuickPickRow('MR Prompt A');
        expect(rowText).to.include('MR Prompt A');
        expect(rowText).to.not.include(path.basename(workspaceA));

        await closeQuickInput();
    });

    it('saves Quick Add selection into the active editor workspace root', async function () {
        const selectedText = uniqueMarker('selection-from-workspace-b');

        await closeQuickInput();
        await closeAllEditors();
        await VSBrowser.instance.openResources(fileInWorkspaceB);
        await waitForOpenEditor('workspace-b-source.txt');

        const editor = new TextEditor();
        await editor.setText(selectedText);
        await new Workbench().executeCommand('Select All');
        await VSBrowser.instance.driver.sleep(500); // allow VS Code to settle after command palette close

        await runCommandViaKeyboard('Quick Add Prompt (Selection)');

        await waitForPromptRecord(promptsPath(workspaceB), prompt =>
            prompt.content === selectedText &&
            prompt.titleSource === 'ai'
        );

        const promptsA = readPromptsFile(promptsPath(workspaceA));
        expect(promptsA.some(prompt => prompt.content === selectedText)).to.equal(false);
    });
});

function createMultiRootFixture(): void {
    parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-prompt-multiroot-ui-'));
    workspaceA = path.join(parentRoot, 'qp-mr-a');
    workspaceB = path.join(parentRoot, 'qp-mr-b');
    workspaceFile = path.join(parentRoot, 'quick-prompt-multiroot.code-workspace');
    fileInWorkspaceB = path.join(workspaceB, 'workspace-b-source.txt');

    fs.mkdirSync(path.join(workspaceA, '.vscode'), { recursive: true });
    fs.mkdirSync(path.join(workspaceB, '.vscode'), { recursive: true });
    fs.writeFileSync(promptsPath(workspaceA), JSON.stringify([seedPrompt('001', 'MR Prompt A', 'Content from multi-root A')], null, 2), 'utf8');
    fs.writeFileSync(promptsPath(workspaceB), JSON.stringify([seedPrompt('001', 'MR Prompt B', 'Content from multi-root B')], null, 2), 'utf8');
    fs.writeFileSync(fileInWorkspaceB, 'workspace B source file', 'utf8');
    fs.writeFileSync(workspaceFile, JSON.stringify({
        folders: [
            { path: workspaceA },
            { path: workspaceB }
        ],
        settings: {}
    }, null, 2), 'utf8');
}

function cleanupMultiRootFixture(): void {
    if (!parentRoot) {
        return;
    }

    try {
        fs.rmSync(parentRoot, { recursive: true, force: true });
    } catch {
        // VS Code may still hold a handle during shutdown on Windows.
    }
}

function seedPrompt(id: string, title: string, content: string): PromptRecord {
    return {
        id,
        title,
        content,
        use_count: 0,
        last_used: '2026-06-23',
        created_at: '2026-06-23T00:00:00.000Z',
        pinned: false,
        titleSource: 'user',
        meta: { totalVersions: 0, latestVersionId: '' },
    };
}

function promptsPath(root: string): string {
    return path.join(root, '.vscode', 'prompts.json');
}

async function waitForWorkbench(): Promise<void> {
    const driver = VSBrowser.instance.driver;
    await driver.wait(async () => {
        try {
            const wb = await driver.findElement(By.css('.monaco-workbench'));
            return await wb.isDisplayed();
        } catch {
            return false;
        }
    }, 30_000, 'Monaco workbench did not appear');
    await driver.sleep(2000);
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
    const widget = await waitForQuickInput();
    const inputEl = await getQuickInputField(widget);
    await resetKeyboardState();

    await driver.executeScript(
        `
        const input = arguments[0];
        const value = arguments[1];
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: value
        }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        `,
        inputEl,
        text
    );

    await driver.wait(async () => {
        try {
            const currentInput = await getQuickInputField(await waitForQuickInput());
            return (await currentInput.getAttribute('value')) === text;
        } catch {
            return false;
        }
    }, 5_000, `Quick input value was not replaced with "${text}"`);
}

async function getQuickInputField(widget: WebElement): Promise<WebElement> {
    for (const selector of ['input.quick-input-box', 'input.input', 'input']) {
        const fields = await widget.findElements(By.css(selector));
        if (fields.length > 0) {
            return fields[0];
        }
    }

    throw new Error('Quick input field was not found');
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

async function closeAllEditors(): Promise<void> {
    try {
        await new EditorView().closeAllEditors();
    } catch {
        await dismissSaveDialog();
    }
    await dismissSaveDialog();
}

async function dismissSaveDialog(): Promise<void> {
    const driver = VSBrowser.instance.driver;
    try {
        const modal = await driver.findElement(By.css('.monaco-dialog-modal-block'));
        if (!await modal.isDisplayed()) {
            return;
        }

        const buttons = await driver.findElements(By.css('.dialog-buttons-row .monaco-button'));
        for (const button of buttons) {
            const text = (await button.getText()).toLowerCase();
            if (text.includes("don't save") || text.includes('discard') || text.includes('revert')) {
                await button.click();
                await driver.sleep(300);
                return;
            }
        }

        await driver.actions().sendKeys(Key.ESCAPE).perform();
        await driver.sleep(300);
    } catch {
        // No modal present.
    }
}

async function resetKeyboardState(): Promise<void> {
    await VSBrowser.instance.driver.actions().sendKeys(Key.NULL).perform();
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

async function getWorkbenchRowsText(): Promise<string> {
    const rows = await VSBrowser.instance.driver.findElements(By.css('.monaco-list-row'));
    const texts: string[] = [];
    for (const row of rows) {
        try {
            texts.push((await row.getText()).trim());
        } catch {
            // Rows can be re-rendered while reading.
        }
    }

    return texts.join('\n');
}

async function waitForOpenEditor(expectedTitle: string): Promise<void> {
    const driver = VSBrowser.instance.driver;
    await driver.wait(async () => {
        const titles = await new EditorView().getOpenEditorTitles();
        return titles.some(title => title.includes(expectedTitle));
    }, 10_000, `Editor "${expectedTitle}" did not open`);
}

function readPromptsFile(filePath: string): PromptRecord[] {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PromptRecord[];
    } catch {
        return [];
    }
}

async function waitForPromptRecord(
    filePath: string,
    predicate: (prompt: PromptRecord) => boolean
): Promise<PromptRecord> {
    const driver = VSBrowser.instance.driver;

    const promptRecord = await driver.wait(() => {
        const prompts = readPromptsFile(filePath);
        const found = prompts.find(prompt => predicate(prompt));
        return found || false;
    }, 10_000, 'Expected prompt record was not persisted');

    return promptRecord as PromptRecord;
}

function uniqueMarker(prefix: string): string {
    return `ui-test-${prefix}-${Date.now()}`;
}
