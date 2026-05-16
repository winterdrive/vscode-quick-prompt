import {
    ActivityBar,
    ViewControl,
    SideBarView,
    EditorView,
    VSBrowser,
    Workbench,
} from 'vscode-extension-tester';
import { expect } from 'chai';

describe('Quick Prompt – Basic UI', function () {
    this.timeout(30_000);

    let viewControl: ViewControl;

    before(async function () {
        await VSBrowser.instance.waitForWorkbench();

        // Dismiss any onboarding overlay
        const driver = VSBrowser.instance.driver;
        try {
            const overlay = await driver.findElement({ css: '.onboarding-a-overlay.visible' });
            if (await overlay.isDisplayed()) {
                await driver.executeScript('arguments[0].remove()', overlay);
            }
        } catch { /* not present */ }

        const activityBar = new ActivityBar();
        viewControl = (await activityBar.getViewControl('Quick Prompt'))!;
        expect(viewControl, 'Quick Prompt icon not found in Activity Bar').to.not.be.undefined;
    });

    after(async function () {
        await new EditorView().closeAllEditors();
    });

    it('Activity Bar contains the Quick Prompt icon', async function () {
        const title = await viewControl.getTitle();
        expect(title).to.equal('Quick Prompt');
    });

    it('Clicking the icon opens the sidebar', async function () {
        const sidebar = (await viewControl.openView()) as SideBarView;
        expect(sidebar).to.not.be.undefined;
    });

    it('Sidebar title section reads "Quick Prompt"', async function () {
        const sidebar = (await viewControl.openView()) as SideBarView;
        const title = await sidebar.getTitlePart().getTitle();
        expect(title.toLowerCase()).to.include('quick prompt');
    });

    // Quick Prompt has multiple view panels in one container (Prompts + Clipboard History).
    // The Add Prompt toolbar button lives inside the "Prompts" view panel header,
    // not the container's title bar — so we use getSections() to reach it.
    it('Prompts view section is present in the sidebar', async function () {
        const sidebar = (await viewControl.openView()) as SideBarView;
        const sections = await sidebar.getContent().getSections();
        const titles = await Promise.all(sections.map(s => s.getTitle()));
        expect(titles.some(t => /prompt/i.test(t))).to.be.true;
    });
});

describe('Quick Prompt – Prompt CRUD (UI)', function () {
    this.timeout(60_000);

    let viewControl: ViewControl;

    before(async function () {
        await VSBrowser.instance.waitForWorkbench();
        const activityBar = new ActivityBar();
        viewControl = (await activityBar.getViewControl('Quick Prompt'))!;
        await viewControl.openView();
    });

    after(async function () {
        await new EditorView().closeAllEditors();
    });

    // Use the command palette instead of toolbar click — more reliable across
    // multi-view containers where getTitlePart().getActions() returns container-
    // level buttons only.
    it('Add Prompt command opens an editor tab', async function () {
        const workbench = new Workbench();
        await workbench.executeCommand('Add Prompt (Auto Title)');
        await new Promise(r => setTimeout(r, 2000));

        const editorView = new EditorView();
        const tabs = await editorView.getOpenTabs();
        expect(tabs.length).to.be.greaterThan(0);
    });
});
