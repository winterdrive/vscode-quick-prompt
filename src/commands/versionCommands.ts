import * as vscode from 'vscode';
import { VersionItem } from '../treeItems/VersionItem';
import { VersionHistoryService } from '../services/VersionHistoryService';
import { PromptProvider } from '../promptProvider';
import { I18n } from '../i18n';
import { executeWithConfirmation } from '../utils';

/**
 * Show diff between a historical version and the current version
 */
export async function handleShowVersionDiff(
    item: VersionItem,
    versionHistoryService: VersionHistoryService
): Promise<void> {
    try {
        const history = await versionHistoryService.loadHistory(item.promptId);
        const currentVersion = history.versions.find(v => v.versionId === history.currentVersionId);

        if (!currentVersion) {
            vscode.window.showErrorMessage(I18n.getMessage('message.versionNotFound'));
            return;
        }

        // Create temporary URIs for diff
        const historyUri = vscode.Uri.parse(`prompt-history:///${item.promptId}/${item.version.versionId}`);
        const currentUri = vscode.Uri.parse(`prompt-history:///${item.promptId}/current`);

        // Register temporary text document content provider
        const provider = new class implements vscode.TextDocumentContentProvider {
            provideTextDocumentContent(uri: vscode.Uri): string {
                if (uri.path.endsWith('/current')) {
                    return currentVersion.content;
                } else {
                    return item.version.content;
                }
            }
        };

        const registration = vscode.workspace.registerTextDocumentContentProvider('prompt-history', provider);

        // Show diff
        const historyLabel = item.version.milestone?.label || new Date(item.version.timestamp).toLocaleString();
        const diffTitle = I18n.getMessage('message.diffTitle', historyLabel);

        await vscode.commands.executeCommand(
            'vscode.diff',
            historyUri,
            currentUri,
            diffTitle
        );

        // Clean up after a delay
        setTimeout(() => registration.dispose(), 60000);
    } catch (error) {
        console.error('Failed to show version diff:', error);
        vscode.window.showErrorMessage(I18n.getMessage('message.showDiffFailed'));
    }
}

/**
 * Restore a historical version (creates a new version with changeType: 'restore')
 */
/**
 * Apply a historical version content to the current editor (Soft Checkout)
 * This loads the content but acts as an unsaved edit.
 */
export async function handleApplyVersion(
    item: VersionItem,
    promptProvider: PromptProvider
): Promise<void> {
    try {
        // No confirmation needed for soft checkout as it is non-destructive until saved

        // Use the virtual file system URI
        // Pattern: prompt-sniper:/<promptId>.md
        const uri = vscode.Uri.parse(`prompt-sniper:/${item.promptId}.md`);

        // Open the document
        const document = await vscode.workspace.openTextDocument(uri);

        // Check for unsaved changes (Dirty Check)
        if (document.isDirty) {
            const answer = await vscode.window.showWarningMessage(
                I18n.getMessage('message.dirtyCheck'),
                { modal: true },
                I18n.getMessage('confirm.overwriteAndApply'),
                I18n.getMessage('confirm.cancel')
            );

            if (answer !== I18n.getMessage('confirm.overwriteAndApply')) {
                return;
            }
        }

        // Show the document
        await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: false
        });

        // Replace the content using WorkspaceEdit (this makes it dirty)
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        edit.replace(uri, fullRange, item.version.content);
        await vscode.workspace.applyEdit(edit);

        vscode.window.showInformationMessage(I18n.getMessage('message.versionApplied'));

    } catch (error: any) {
        console.error('Failed to apply version:', error);

        // Provide more friendly error message
        let userMessage = I18n.getMessage('message.applyVersionFailed', error.message);
        if (error.code === 'FileNotFound') {
            userMessage = I18n.getMessage('message.applyVersionFailedFileNotFound');
        } else if (error.message.includes('permission')) {
            userMessage = I18n.getMessage('message.applyVersionFailedPermission');
        }

        vscode.window.showErrorMessage(userMessage);
    }
}

/**
 * Tag a version as a milestone
 */
export async function handleTagMilestone(
    item: VersionItem,
    versionHistoryService: VersionHistoryService,
    promptProvider: PromptProvider
): Promise<void> {
    try {
        // Show input box for milestone label
        const label = await vscode.window.showInputBox({
            prompt: I18n.getMessage('input.milestoneLabel'),
            placeHolder: I18n.getMessage('input.milestonePlaceholder'),
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return I18n.getMessage('validate.labelRequired');
                }
                if (value.length > 50) {
                    return I18n.getMessage('validate.labelTooLong');
                }
                return null;
            }
        });

        if (!label) {
            return; // User cancelled
        }

        // Tag the milestone
        await versionHistoryService.tagMilestone(item.promptId, item.version.versionId, label.trim());

        // Refresh the tree view
        await promptProvider.refresh();

        vscode.window.showInformationMessage(I18n.getMessage('message.milestoneTagged', label));
    } catch (error: any) {
        console.error('Failed to tag milestone:', error);
        vscode.window.showErrorMessage(I18n.getMessage('message.tagMilestoneFailed', error.message));
    }
}

/**
 * Rename a milestone
 */
export async function handleRenameMilestone(
    item: VersionItem,
    versionHistoryService: VersionHistoryService,
    promptProvider: PromptProvider
): Promise<void> {
    try {
        if (!item.version.milestone) {
            vscode.window.showErrorMessage(I18n.getMessage('message.notMilestone'));
            return;
        }

        // Show input box with current label
        const label = await vscode.window.showInputBox({
            prompt: I18n.getMessage('input.renameMilestone'),
            value: item.version.milestone.label,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return I18n.getMessage('validate.labelRequired');
                }
                if (value.length > 50) {
                    return I18n.getMessage('validate.labelTooLong');
                }
                return null;
            }
        });

        if (!label || label === item.version.milestone.label) {
            return; // User cancelled or no change
        }

        // Update the milestone
        await versionHistoryService.tagMilestone(item.promptId, item.version.versionId, label.trim());

        // Refresh the tree view
        await promptProvider.refresh();

        vscode.window.showInformationMessage(I18n.getMessage('message.milestoneRenamed', label));
    } catch (error: any) {
        console.error('Failed to rename milestone:', error);
        vscode.window.showErrorMessage(I18n.getMessage('message.renameMilestoneFailed', error.message));
    }
}

/**
 * Remove milestone tag (keeps the version)
 */
export async function handleRemoveMilestone(
    item: VersionItem,
    versionHistoryService: VersionHistoryService,
    promptProvider: PromptProvider
): Promise<void> {
    try {
        if (!item.version.milestone) {
            vscode.window.showErrorMessage(I18n.getMessage('message.notMilestone'));
            return;
        }

        // Confirm removal
        const confirm = await vscode.window.showWarningMessage(
            I18n.getMessage('confirm.removeMilestone', item.version.milestone.label),
            { modal: true },
            I18n.getMessage('action.remove')
        );

        if (confirm !== I18n.getMessage('action.remove')) {
            return;
        }

        // Remove the milestone
        await versionHistoryService.removeMilestone(item.promptId, item.version.versionId);

        // Refresh the tree view
        await promptProvider.refresh();

        vscode.window.showInformationMessage(I18n.getMessage('message.milestoneRemoved'));
    } catch (error: any) {
        console.error('Failed to remove milestone:', error);
        vscode.window.showErrorMessage(I18n.getMessage('message.removeMilestoneFailed', error.message));
    }
}

/**
 * Delete a version
 */
export async function handleDeleteVersion(
    item: VersionItem,
    versionHistoryService: VersionHistoryService,
    promptProvider: PromptProvider
): Promise<void> {
    const versionLabel = item.version.milestone?.label || new Date(item.version.timestamp).toLocaleString();
    const message = I18n.getMessage('confirm.deleteVersion', versionLabel);
    const confirmLabel = I18n.getMessage('action.delete');

    await executeWithConfirmation(
        message,
        confirmLabel,
        async () => {
            try {
                // Delete the version
                await versionHistoryService.deleteVersion(item.promptId, item.version.versionId);

                // Refresh the tree view
                await promptProvider.refresh();

                vscode.window.showInformationMessage(I18n.getMessage('message.versionDeleted'));
            } catch (error: any) {
                console.error('Failed to delete version:', error);
                vscode.window.showErrorMessage(I18n.getMessage('message.deleteVersionFailed', error.message));
            }
        }
    );
}

/**
 * Copy version content to clipboard
 */
export async function handleCopyVersionContent(
    item: VersionItem,
    promptProvider: PromptProvider
): Promise<void> {
    try {
        let outputText = item.version.content;

        await vscode.env.clipboard.writeText(outputText);
        const label = item.version.milestone?.label || new Date(item.version.timestamp).toLocaleString();
        vscode.window.showInformationMessage(I18n.getMessage('message.versionContentCopied', label));
    } catch (error: any) {
        console.error('Failed to copy version content:', error);
        vscode.window.showErrorMessage(I18n.getMessage('message.copyFailed', error.message));
    }
}
