/**
 * Malformed on-disk config resilience — UI / E2E
 * ================================================
 *
 * Covers the "extension doesn't fall over when a config file has an
 * unexpected shape" bugfixes from PR #66 and PR #69. Both already have
 * solid unit coverage (src/test/unit/privacyManager.test.ts,
 * src/test/unit/secretStorage.test.ts) that exercises the guard clauses
 * directly. This file's job is different: does the REAL, running
 * extension keep working when the artifact is corrupted on disk before
 * VS Code even opens the workspace.
 *
 * IMPORTANT HONESTY NOTE — please read before extending this file:
 *
 * - PR #66 (PrivacyManager dictionary shape guard, src/core/PrivacyManager.ts)
 *   guards `.vscode/privacy-dictionary.json`. Investigation of the shipped
 *   extension runtime (src/extension.ts, src/promptProvider.ts,
 *   src/commands.ts) shows `PrivacyManager` is NOT instantiated anywhere in
 *   the VS Code extension host — it is exported from src/core/index.ts for
 *   the standalone `qp.bundle.js` CLI (built via `npm run build:qp`, shipped
 *   as the `quickprompt` Claude Code skill), a separate Node process outside
 *   VS Code. The extension's own privacy/masking feature
 *   (src/privacy/maskingEngine.ts) explicitly says "Dictionary feature
 *   removed in v2 — custom rules via settings instead" and always calls
 *   `enableCustom: false`. So a corrupted `.vscode/privacy-dictionary.json`
 *   is never read by the running extension today — there is no reachable
 *   crash to reproduce at the UI level for PR #66 as things currently stand.
 *   The test below is kept anyway as a narrow, honestly-scoped smoke test:
 *   it proves a stray/corrupted dictionary file sitting in `.vscode/` causes
 *   no adverse effect on activation or normal use (defends against any
 *   future code path that starts reading this file, and guards against
 *   unrelated regressions like a blind directory scan). It does NOT
 *   exercise `PrivacyManager.loadDictionary()`'s guard clause itself — that
 *   verification only exists at the unit-test level.
 *
 * - PR #69 (SecretStorageManager token map shape guard,
 *   src/privacy/masking/secretStorage.ts) IS wired into the real extension
 *   (src/promptProvider.ts constructs it from `context.secrets` and uses it
 *   for the Mask/Unmask Prompt commands). However its own file header says
 *   plainly: "Stores tokenMap per prompt using VS Code SecretStorage API
 *   (OS-level encrypted). The tokenMap never touches disk — it lives only
 *   in the OS keychain." There is no workspace file, extension global-state
 *   JSON, or other on-disk artifact to corrupt from outside the process in
 *   order to reproduce the malformed shape; doing so would require mocking
 *   `vscode.SecretStorage` at the unit level, which the existing unit test
 *   already does. Writing an E2E test that pretends to corrupt "the" secret
 *   storage file would be misleading (there isn't one), so PR #69 is
 *   deliberately NOT covered here.
 */

import {
    ActivityBar,
    SideBarView,
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
let dictionaryPath = '';
let viewControl: ViewControl;

const seededPrompt: PromptRecord = {
    id: '9101',
    title: 'Malformed Config Seed Prompt',
    content: 'Seed content used to confirm the sidebar renders normally.',
    use_count: 0,
    last_used: '2026-08-18',
    created_at: '2026-08-18T00:00:00.000Z',
    pinned: false,
    titleSource: 'user',
    order: 0,
    meta: { totalVersions: 0, latestVersionId: '' },
    ignorePrivacyWarning: false,
};

describe('Quick Prompt - Malformed config resilience UI / E2E', function () {
    this.timeout(120_000);

    before(async function () {
        createIsolatedWorkspace();
        // Corrupt the file BEFORE VS Code ever opens the workspace, so any
        // read-on-activation path (present or future) sees the bad shape
        // from the very first activation, not after a later re-read.
        writeMalformedPrivacyDictionary();
        seedPrompts();

        await VSBrowser.instance.waitForWorkbench();
        await VSBrowser.instance.openResources(workspaceRoot);
        await dismissOnboardingOverlay();

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
            } catch { /* retry while extension host is activating */ }
            await driver.sleep(1500);
        }
        expect(foundControl, 'Quick Prompt icon not found in Activity Bar — extension likely failed to activate with a malformed privacy-dictionary.json present').to.not.be.undefined;
        viewControl = foundControl!;
        await retryCommand('Refresh Prompts');
    });

    after(async function () {
        await closeQuickInput();
        cleanupIsolatedWorkspace();
    });

    it('activates without an error notification when .vscode/privacy-dictionary.json has a malformed shape', async function () {
        const driver = VSBrowser.instance.driver;

        const errorToasts = await driver.findElements(By.css('.notification-toast.severity-error'));
        const errorTexts: string[] = [];
        for (const toast of errorToasts) {
            try {
                errorTexts.push((await toast.getText()).toLowerCase());
            } catch { /* toast may have dismissed itself */ }
        }
        const relevantErrors = errorTexts.filter(t => t.includes('quick prompt') || t.includes('privacy') || t.includes('dictionary'));
        expect(relevantErrors, `Unexpected error notification(s) referencing privacy/dictionary: ${JSON.stringify(relevantErrors)}`).to.have.lengthOf(0);
    });

    it('renders the Quick Prompt sidebar normally despite the malformed dictionary file', async function () {
        expect(await viewControl.getTitle()).to.equal('Quick Prompt');

        const sidebar = (await viewControl.openView()) as SideBarView;
        const title = await sidebar.getTitlePart().getTitle();
        expect(title.toLowerCase()).to.include('quick prompt');

        const sections = await sidebar.getContent().getSections();
        const titles = await Promise.all(sections.map(s => s.getTitle()));
        expect(titles.some(t => /prompt/i.test(t))).to.be.true;
        expect(titles.some(t => /clipboard/i.test(t))).to.be.true;

        const seededRow = await waitForWorkbenchText('Malformed Config Seed Prompt');
        expect(seededRow).to.include('Malformed Config Seed Prompt');
    });

    it('still supports adding a prompt normally with the malformed dictionary file present', async function () {
        const title = uniqueMarker('malformed-dict-add-title');
        const content = uniqueMarker('malformed-dict-add-content');

        await runCommandViaKeyboard('Add Prompt (Custom Title)');
        await waitForQuickInputText('Set title for this prompt');
        await replaceQuickInputText(title);
        await acceptQuickInput();
        await waitForQuickInputText('Enter Prompt content');
        await replaceQuickInputText(content);
        await acceptQuickInput();

        await waitForPromptRecord(prompt =>
            prompt.title === title &&
            prompt.content === content &&
            prompt.titleSource === 'user'
        );

        // The dictionary file itself should still be exactly what we wrote —
        // nothing in this flow should have touched or "fixed" it up.
        const stillMalformed = fs.readFileSync(dictionaryPath, 'utf8');
        expect(JSON.parse(stillMalformed)).to.deep.equal({ entries: null });
    });
});

function createIsolatedWorkspace(): void {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-prompt-malformed-config-ui-'));
    vscodeDir = path.join(workspaceRoot, '.vscode');
    promptsPath = path.join(vscodeDir, 'prompts.json');
    dictionaryPath = path.join(vscodeDir, 'privacy-dictionary.json');
    fs.mkdirSync(vscodeDir, { recursive: true });
}

function writeMalformedPrivacyDictionary(): void {
    // Shape from PR #66: parses as valid JSON but `entries` is not an array.
    fs.writeFileSync(dictionaryPath, JSON.stringify({ entries: null }), 'utf8');
}

function seedPrompts(): void {
    fs.writeFileSync(promptsPath, JSON.stringify([seededPrompt], null, 2), 'utf8');
}

function cleanupIsolatedWorkspace(): void {
    if (!workspaceRoot) {
        return;
    }
    try {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    } catch {
        // VS Code may still hold a handle during shutdown on Windows.
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

async function waitForQuickInputText(expectedText: string): Promise<string> {
    const driver = VSBrowser.instance.driver;

    const matchedText = await driver.wait(async () => {
        try {
            const widget = await waitForQuickInput();
            const text = (await widget.getText()).trim();
            return text.toLowerCase().includes(expectedText.toLowerCase())
                ? text
                : false;
        } catch {
            return false;
        }
    }, 10_000, `Quick input text "${expectedText}" did not appear`);

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
    try {
        return JSON.parse(fs.readFileSync(promptsPath, 'utf8')) as PromptRecord[];
    } catch {
        // File may be mid-write; return empty so the poller retries
        return [];
    }
}

async function waitForPromptRecord(predicate: (prompt: PromptRecord) => boolean): Promise<PromptRecord> {
    const driver = VSBrowser.instance.driver;

    const promptRecord = await driver.wait(() => {
        const prompts = readPromptsFile();
        const found = prompts.find(predicate);
        return found || false;
    }, 10_000, 'Expected prompt record was not persisted');

    return promptRecord as PromptRecord;
}

function uniqueMarker(prefix: string): string {
    return `ui-test-${prefix}-${Date.now()}`;
}
