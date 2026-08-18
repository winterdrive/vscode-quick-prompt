# Testing Guide (Quick Prompt)

[繁體中文](./TESTING.zh-TW.md) | English

This is the current, maintained reference for this repo's **automated** test
suites. Note for context: `PrivacyManager`'s dictionary feature (see the unit
test table below) predates a v2 rewrite that replaced it with settings-based
custom rules (`src/privacy/maskingEngine.ts`) — if you find older local notes
describing an interactive Privacy Dictionary UI, that feature no longer
exists; don't use such notes to judge current behavior or coverage.

If you add, rename, or remove a test file, update this doc in the same PR.

## Running the tests

| Suite | Command | What it covers |
|---|---|---|
| Root unit tests | `npm test` | Pure Node/Jest tests for the extension host code, mocking `vscode` via `src/test/__mocks__/vscode.ts` |
| mcp-server unit tests | `cd mcp-server && npm test` | Isolated Jest config (`mcp-server/jest.config.cjs`) for the MCP server package, which has different module/tsconfig settings than the root and can't share the root's ts-jest config |
| UI / E2E tests | `npm run test:ui` | Real VS Code + Selenium (`vscode-extension-tester`) driving the packaged extension end to end |

**UI tests require a real, visible VS Code window and take several minutes.**
They should be run by a human on their own machine, not by an AI agent in a
sandboxed environment — see "Known limitations" below for why.

The mcp-server suite is *not* part of the root `npm test` run (its `src/test/`
files match the root Jest config's `testMatch` glob and happen to also pass
under the root's `ts-jest` config today, but it has its own dedicated config
and script specifically so it isn't required to keep working that way).

## Root unit tests (`src/test/unit/`)

| File | Covers |
|---|---|
| `promptManager.test.ts` | `PromptManager` CRUD: load/save prompts.json, corrupted/non-array JSON recovery, create/update/delete/pin/reorder/increment-use, optimistic locking (`OptimisticLockError`), cache invalidation |
| `versionManager.test.ts` | `VersionManager`: version history CRUD, corrupted/wrong-shape JSON recovery, dedup on unchanged content, milestones, `MAX_VERSIONS` pruning (protects milestones), cache clearing, path-traversal rejection |
| `versionHistoryService.test.ts` | `VersionHistoryService`: load/reset on corrupted or wrong-shape history, fs-error logging doesn't leak the raw error/path but still rethrows |
| `versionCommands.test.ts` | **PR #71** — `handleShowVersionDiff` disposes its previous `TextDocumentContentProvider` registration before creating the next one, and viewing two diffs back to back never throws |
| `versionItem.test.ts` | **PR #68** (security) — `VersionItem`'s tooltip `MarkdownString` has `isTrusted` falsy, even for a milestone label crafted as a `command:` link |
| `promptHoverProvider.test.ts` | **PR #68** (security) — same `isTrusted` property, for `PromptHoverProvider`'s hover `MarkdownString` built from a prompt title |
| `promptProviderFsErrorLogging.test.ts` | **PR #67** — `PromptProvider.savePrompts()` logs only the fs error code on failure, never the full workspace path |
| `promptProviderMultiroot.test.ts` | `PromptProvider` routing in multi-root workspaces: version history stored in the correct workspace, doesn't overwrite a workspace that failed to load, scope switching, quick-create target resolution |
| `multiroot.test.ts` | Multi-root support at the `PromptManager`/MCP-tool level: workspace-prefixed IDs, routing validation, primary-workspace fallback |
| `clipboardManager.test.ts` | `ClipboardManager`: duplicate/short/numeric-content filtering, corrupted history JSON recovery, **PR #74** fs-error path-leak fix, focus-listener disposal |
| `secretStorage.test.ts` | `SecretStorageManager`: round-trip, and **PR #69** guard against a malformed/non-object/non-string token map (returns `undefined` instead of corrupting output) |
| `privacyManager.test.ts` | `PrivacyManager`: repeated-value unmasking, **issue #63** — restores longer masked values before a shorter one that's their literal prefix (regardless of dictionary-insertion order), and **PR #66** malformed `privacy-dictionary.json` shape guard. Note: this class's dictionary feature is only reachable from the standalone `qp.bundle.js` CLI (the `quickprompt` skill), not the VS Code extension UI — the fix is correct but doesn't affect any current VS Code UI user |
| `maskingEngine.test.ts` | `MaskingEngine` registers its config-change listener as a disposable (resource-leak guard) |
| `mcpConfigPanel.test.ts` | **PR #79** (security) — `escapeHtmlForWebview()` correctly escapes `&<>"'`, used to sanitize workspace names before they're interpolated into the MCP config webview's HTML |
| `i18n.test.ts` | `I18n`: doesn't throw on a missing/failing locale file, falls back to English, and **PR #70** doesn't log the raw error object, only the locale code |
| `pathUtils.test.ts` | `PathUtils`: workspace-containment validation (including path-traversal and sibling-prefix attacks), path resolution/relativization, directory creation, JSON read/write, mtime lookup |
| `patternRegistry.test.ts` | `PatternRegistry.mask()`: repeated-match masking when label length differs from match length, 3+ occurrences of the same pattern |
| `aiEngine.test.ts` | **PR #77** — `AIEngine.handleWorkerMessage` rejects the specific pending request immediately on a worker error (by `requestId`), doesn't affect other concurrently pending requests, and falls back to the pre-fix global-status behavior when a message has no `requestId` |

## mcp-server unit tests (`mcp-server/src/test/`)

| File | Covers |
|---|---|
| `stateStore.test.ts` | **PR #73** — `loadState()`/`saveState()` (the `~/.quickprompt-mcp-state.json` persisted state) guard against `null`/array/number/invalid-JSON shapes, falling back to `{}` instead of crashing the whole MCP server process |
| `clipboardTools.test.ts` | **PR #75** — the clipboard MCP tool doesn't leak the clipboard-history file's absolute path in an fs-error response |

## UI / E2E tests (`src/test/ui/`)

Each file opens its own temp workspace (or its own `.code-workspace` fixture)
via `VSBrowser.instance.openResources(...)` in a `before()` hook — they don't
share state with each other, though they do all run in the *same* VS Code/
Chromium process within one `npm run test:ui` invocation (mocha runs them
sequentially as separate `describe` blocks against sequentially-opened
workspaces).

| File | Covers |
|---|---|
| `quickPrompt.ui.test.ts` | The core interactive flows: sidebar renders, command palette exposes the primary commands, search + copy + use-count increment, opening a prompt from the tree and editing it, Add Prompt (Auto Title / Custom Title), Quick Add from selection, Show MCP Config, Refresh Clipboard History |
| `multiRootQuickPrompt.ui.test.ts` | Multi-root workspace behavior through the real UI: flat prompt list for the default scope, scoped search, Quick Add targeting the active editor's workspace root |
| `securityFixes.ui.test.ts` | **PR #79** (security) — opens a real multi-root workspace with a maliciously-named folder, runs "Show MCP Config", and inspects the actual webview DOM to confirm the payload renders as inert text and never executes. (**PR #68's hover E2E test was removed** — see "Known limitations" below; that fix's coverage lives entirely in the unit tests) |
| `versionDiff.ui.test.ts` | **PR #71** — clicks through 3 version-history rows back-to-back via real tree interaction, confirms each diff renders correctly with no "failed to show version diff" notification |
| `malformedConfigResilience.ui.test.ts` | **PR #66** — corrupts `.vscode/privacy-dictionary.json` *before* opening the workspace, confirms the extension still activates, the sidebar renders, and adding a prompt still works. (Does **not** exercise `PrivacyManager`'s guard clause itself, since that class isn't wired into the extension UI — only proves the extension doesn't crash) |
| `aiTitleGeneration.ui.test.ts` | **PR #77**, narrower scope — points the AI provider at an unreachable endpoint and confirms "Add Prompt (Auto Title)" still persists a fallback title within seconds (not the 90s worker timeout) and the extension host stays responsive afterward. Does not reproduce the exact `requestId`-rejection code path (see unit test), since triggering a *real* local-model worker error requires an actual model download and has no UI-observable signature anyway — the background title-generation call is fire-and-forget |

### Investigated but not written (documented reasoning inline in the relevant test file or PR)

- **Issue #63** (`PrivacyManager` substring-label unmasking): not E2E-testable — the class isn't reachable from any VS Code command or UI action.
- **PR #69** (`SecretStorageManager` malformed token map): not E2E-testable — the token map lives only in the OS keychain via VS Code's `SecretStorage` API, never as an on-disk artifact that a test could corrupt from outside the process.
- **PR #78** (`clipboardHistoryView` tree provider disposal): the only way to observe a real disposal failure is a full extension deactivate/reactivate cycle (e.g. "Developer: Reload Window"), and `vscode-extension-tester`'s WebDriver session does not survive a window reload in this Electron setup — no reconnection API exists.

## Known limitations

- **UI tests are inherently slower/flakier than unit tests** — they drive a real Electron app via synthetic Selenium input, which has known timing sensitivities (see below). Treat a UI test failure as a signal to *investigate*, not necessarily a real regression — but also don't reflexively add retries without checking whether the failure is genuinely intermittent (random) vs. consistent (a harness limitation retries can't fix; see PR #68 below).
- **`quickPrompt.ui.test.ts` used to hang the entire `npm run test:ui` run.** Two tests ("Quick Add Prompt (Selection)", "Refresh Clipboard History adds copied editor text") open a scratch `File: New Text File` buffer and previously never closed it, leaving it dirty. That dirty tab would trigger VS Code's native "Do you want to save?" confirmation the next time `closeAllEditors()` ran (in this suite's own `after()`, transitioning into the next test file) — and once a user or a later step clicks "Save" on a never-saved file, VS Code has to ask *where*, opening an OS-level "Save As" file picker that WebDriver cannot see or interact with at all, hard-hanging the run. Fixed via `revertAllOpenEditors()` (`workbench.action.revertAndCloseActiveEditor`, not `workbench.action.files.revert` — the latter means "reload from disk" and silently no-ops on an untitled buffer that was never saved).
- **PR #68's E2E hover test was removed, not skipped or retried.** Across every trigger mechanism tried — plain mouse-move dwell, mouse + a "Show or Focus Hover" command, mouse + `this.retries(2)` — the hover tooltip never once rendered within the wait window in this environment. That's a *consistent*, not intermittent, symptom, meaning it's a harness limitation retries can't fix (retries only help with genuinely random flakiness), not a real defect. Forcing it to "pass" via retries would have hidden that fact behind a green checkmark. `isTrusted === false` for both `PromptHoverProvider` and `VersionItem` remains fully covered, without any UI-timing dependency, by `promptHoverProvider.test.ts` and `versionItem.test.ts`.
- **The `.vscode-test/` and shared `%TEMP%/test-resources` caches are shared across all `vscode-extension-tester`-based projects on this machine** (including `editorGrouper`/VirtualTabs and `Edo-Tensei`) by design — `test:ui` deliberately does **not** pass a project-local `-s`/`--storage` override, so re-running `test:ui` in a sibling project reuses the same downloaded VS Code + ChromeDriver instead of re-downloading ~150MB+ per project.
