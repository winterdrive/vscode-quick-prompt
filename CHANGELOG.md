# Quick Prompt Changelog

All notable changes to the "Quick Prompt" extension will be documented in this file.

## [0.6.0] - Privacy & Stability Fixes (pre-release) - 2026-07-22

### 🐛 Bug Fixes

- **test:** ignore local Claude worktrees in Jest (#45)
- **fix(mcp-clipboard):** guard against non-array JSON in clipboard history load (#47)
- **fix(VersionManager):** guard against malformed history JSON shape (#48)
- **fix(PromptManager):** avoid logging full backup file path (#49)
- **fix(extension/aiEngine):** avoid logging full file paths in activation and AI worker startup (#51)
- **fix(mcp-server):** avoid logging full workspace path in MCP server stderr (#55)
- **fix(mcp-server):** avoid logging full workspace paths in server.ts (#57)
- **refactor(VersionHistoryService):** replace deprecated String.substr() with substring() (#46)
- **fix(promptHoverProvider):** correct prompt ID extraction in virtual URI parsing (#52)
- **fix(SkillGenerator):** correct backslash regex in generated skill path display (#53)
- **fix(ClipboardManager):** dispose window focus listener on deactivation (#54)

## [0.5.7] - Stability Fixes - 2026-07-02

### Stability

- Guard clipboard history loading against valid JSON payloads that are not arrays, falling back to an empty history instead of throwing later during clipboard updates.
- Guard prompt loading against non-array `prompts.json` payloads and keep the existing backup-and-reset recovery path explicit and tested.
- Guard version history loading against corrupted JSON and malformed history objects, resetting to an empty history instead of breaking tree rendering or migration for later prompts.
- Ensure local Qwen progress notifications are cleaned up when worker initialization fails, and handle the `withProgress` rejection path to avoid unhandled promise warnings.

### Maintenance

- Replace deprecated `String.prototype.substr()` usage with equivalent `substring()` calls in privacy and version helpers.
- Remove an unused `reply` assignment from the OpenAI-compatible connection test path.
- Added unit coverage for clipboard history, prompt loading, and version history malformed-data recovery paths.

## [0.5.6] - Multi-root Select Scope - 2026-06-24

### 🗂 Multi-root Select Scope

- **Flat prompt list**: Multi-root workspaces no longer show workspace section rows in the tree. Prompts from the active scope are displayed as a clean flat list, preserving the original single-root UX.
- **Select Scope button**: New panel title button lets users pick one or more workspaces to display. Empty selection = show all workspaces.
- **Scope-aware search**: `Search Prompts` only searches within the current scope. Workspace labels appear next to results only when All or multiple workspaces are selected.
- **Tooltip workspace info**: Each prompt shows its workspace name in the hover tooltip instead of a row description, keeping the tree view horizontally uncluttered.
- **Persistent scope**: Active scope is saved to `workspaceState` and restored on reload. Removed workspaces are automatically cleaned up from the saved scope.
- **View description**: Panel header shows current scope (`WorkspaceName` / `All Workspaces` / `N workspaces`).

### 🧪 Tests

- Added `src/test/unit/promptProviderMultiroot.test.ts` and `src/test/unit/multiroot.test.ts` (13 unit tests) covering flat list, scope filtering, and tooltip workspace names.
- Added `src/test/ui/multiRootQuickPrompt.ui.test.ts` (3 E2E tests) covering flat list rendering, scope-aware search, and Quick Add routing to the correct workspace root.

## [0.5.5] - Skill Installer UX - 2026-06-16

### 🧠 Skill Installer UX (closes #25)

- **3-state install flow**: Workspace → Mode → Agents, with back navigation at every step
- **Multi-root workspace support**: Shows workspace picker (with active-editor pre-selection hint) when multiple folders are open
- **Auto Install**: `npx skills add winterdrive/QuickPrompt` launched in a terminal with one click
- **Manual Install**: Multi-select agent picker; choose one or more of Cursor, Antigravity, Claude Code, GitHub Copilot, Kiro IDE, Cline, Gemini CLI
- Added **Gemini CLI** as a supported install target (`.gemini/skills/quickprompt/SKILL.md`)

## [0.5.3] - 2026-05-27

### 📋 Clipboard History

- Added a manual "Refresh" button to the Clipboard History panel to force re-fetch the system clipboard content, resolving potential latency or display delays.

## [0.5.2] - 2026-05-24

### 🧠 Agent Skill (npx skills add)

- Added `skills/quickprompt/SKILL.md` as SSOT for `npx skills add winterdrive/QuickPrompt`
- Refactored `SkillGenerator.ts`: button-generated skill now reads from bundled `SKILL.md` instead of hardcoded inline template, keeping it always in sync

### 🔧 Internal

- Added `build:skills` script to copy SKILL.md and `qp.bundle.js` into `dist/skills/quickprompt/`
- `vscode:prepublish` now runs `build:skills` automatically

## [0.5.1] - 2026-05-23

### Command Naming Cleanup

- Standardized contributed command IDs, keybindings, menus, tree item actions, and status bar command wiring under `quickPrompt.*`.
- Renamed the activity bar container and prompt tree view IDs to `quickPromptContainer` and `quickPromptView`.
- Replaced the legacy virtual prompt URI scheme with `quickprompt:`.
- Added release-facing upgrade notes for users with custom keybindings, macros, tasks, or external automation.
- Bumped the extension to `0.5.1` for the next release.

**Upgrade note:** Command Palette names, default keyboard shortcuts, prompt data, clipboard history, and settings are unchanged. Custom automation should use the documented `quickPrompt.*` command IDs. Restored virtual prompt editor tabs may need to be reopened from the sidebar because virtual prompt tabs now use the `quickprompt:` URI scheme.

## [0.5.0] - Unit Testing Framework & UI Test Scaffold - 2026-05-17

### 🧪 Unit Testing Framework

- **Jest + ts-jest**: 77 tests covering `PromptManager`, `VersionManager`, and `PathUtils` using real file I/O against temporary directories — no mock filesystem, catches real regressions at the integration boundary.
- **Coverage thresholds**: `npm run test:coverage` fails if statements < 80 %, branches < 70 %, functions < 80 %, or lines < 80 %. Current baseline is ~95 % across all three files.
- **VSCode mock** (`src/test/__mocks__/vscode.ts`): Hand-written stub for `workspace`, `window`, `commands`, `ThemeIcon`, `ThemeColor`, `Uri`, `EventEmitter`, and `ExtensionContext`. Injected at Jest's `moduleNameMapper` layer — zero changes to production code.
- **Property-based testing ready**: `fast-check` installed; drop a `*.test.ts` into `src/test/properties/` and use `fc.property()` + `fc.assert()`.

### 🖥 VS Code UI Test Scaffold

- **UI test scaffold** (`vscode-extension-tester` + Mocha): Separate compilation target (`tsconfig.test.ui.json` → `out/test/ui/`) runs against a real downloaded VS Code instance via Selenium WebDriver. Initial tests cover Activity Bar icon, sidebar open, title, and toolbar action discovery.
- **New npm scripts**: `npm test` (unit), `npm run test:coverage`, `npm run test:watch`, `npm run test:ui:setup`, `npm run test:ui`.

## [0.4.3] - Local AI Engine Migration to HuggingFace - 2026-05-16

### 🤖 Local AI Engine — HuggingFace Transformers v3

- **Library migrated**: Switched from deprecated `@xenova/transformers` to `@huggingface/transformers` v3 (now officially maintained by HuggingFace).
- **Model selector**: Choose the local model via `Quick Prompt > AI > Local Model` — SmolLM2-135M, SmolLM2-360M (default), or Qwen3-0.6B. Each option shows estimated download size.
- **Qwen3 thinking mode**: New `Quick Prompt > AI > Enable Thinking` toggle. Off (default) uses the official empty-`<think>` technique for faster responses; on enables full chain-of-thought.
- **Bug fixes**: Worker error messages now correctly update engine status. Inference timeout increased from 30 s to 90 s for slower CPU inference. Fallback title now extracts a full sentence instead of truncating to 10 characters.

### 🛠 TypeScript & Build Updates

- **TypeScript upgraded** from 4.9.5 to 5.9.3.
- **tsconfig**: Added `skipLibCheck`, `esModuleInterop`, and `ES2024` lib for `@huggingface/transformers` v3 compatibility.
- **Import casing fix**: Fixed five `src/` files importing `./clipboardManager` (lowercase) while the actual file is `ClipboardManager.ts` — harmless on Windows, would fail on Linux CI.

## [0.4.2] - Startup & Runtime Performance - 2026-05-14

### ⚡ Startup & Runtime Performance

- **Non-blocking activation**: Version history migration now runs in the background — the sidebar appears immediately without waiting for sequential file reads.
- **Async clipboard history**: `clipboard-history.json` is read with non-blocking async I/O; the panel refreshes automatically once loading completes.
- **Config caching**: Clipboard settings are cached at startup and updated only on user changes, eliminating 4–6 redundant `getConfiguration()` calls per poll cycle.
- **Storage path cached**: Clipboard storage path computed once at startup instead of rechecking directory existence on every save.
- **Faster deep clone**: Replaced `JSON.parse(JSON.stringify(...))` with `structuredClone()` in `PromptManager` — 3–5× faster.
- **"View Full Content"**: The inline clipboard action renamed from "Edit as Prompt" to "View Full Content" — opens raw content in a read-only temporary editor without converting it to a permanent Prompt.

## [0.4.0] - Frictionless Add Flow & Smart Sort - 2026-05-14

### ✏️ Frictionless Add Flow & Rename

- **Frictionless Add**: "Add Prompt" creates an empty prompt with a placeholder title and immediately opens the editor — no upfront input box. Start writing directly.
- **Auto Title on First Save**: A fallback title is generated from content on first save; if AI is enabled, it refines the title in the background.
- **Add Prompt (Custom Title)**: The original two-step flow (title → content) is preserved as a separate command for users who prefer explicit titles.
- **Rename Prompt**: Right-click any prompt to rename its title inline without opening the full editor.
- **Click to Edit**: Clicking a prompt opens the editor directly; the redundant inline Edit button has been removed.

### 📊 Smart Sort & Tooltip Improvements

- **Smarter default sort**: Prompts without a manual order are sorted by creation time (newest first) for predictable placement.
- **Lazy manual ordering**: Explicit `order` values are only assigned when first using Move Up / Move Down; existing sequential orders are migrated automatically.
- **Precise `created_at`**: New prompts store a full ISO datetime instead of date-only, enabling accurate same-day ordering.
- **Tooltip**: Metadata (usage count, last used, source) now appears at the top, followed by a 300-char content preview.

## [0.3.7] - Performance & Automated Publishing - 2026-05-08

### 🚀 Performance & CI/CD

- **State management**: Enhanced memory efficiency in `ClipboardManager` and `PromptProvider`.
- **Automated publishing**: Added `publish.yml` GitHub Actions workflow for automated deployments to VS Code Marketplace and Open VSX.

## [0.3.6] - Voice-Ready MCP & Global Clipboard Persistence - 2026-04-22

### 🎙 Voice-Ready MCP Integration & Global Clipboard

- **Voice-ready validation**: Completed E2E testing for Voice-Ready MCP architecture with semantic routing and phonetic error tolerance (e.g. mapping "Li-Ate" → "React").
- **Global clipboard persistence**: Migrated clipboard history from VS Code's internal `globalState` (SQLite) to `~/.quickprompt/clipboard-history.json` — enables cross-IDE access and survives extension reloads.
- **`get_clipboard_item` MCP tool**: Improved error handling, boundary checks, and descriptive indexing hints for AI agents.
- **Smart Skill Generation**: `SkillGenerator.ts` now injects phonetic and typographical error-handling instructions into generated skill files.

## [0.3.5] - Custom AI Endpoints & Strict Opt-In - 2026-04-15

### 🔌 Custom AI Endpoints (Ollama / LM Studio)

- **OpenAI-compatible API**: Route AI tasks through external endpoints (Ollama, LM Studio) via `quickPrompt.ai.provider` and `quickPrompt.ai.openaiCompatible.*`.
- **Test AI Connection command**: `Quick Prompt: Test AI Connection` instantly verifies endpoint configuration.
- **Strict opt-in AI**: All AI features are disabled by default — no model loads into memory, no background processes start on install. Users must enable `quickPrompt.ai.enabled` explicitly.
- **Worker thread leak fix**: Fixed a memory and thread leak when repeatedly toggling the AI provider. The Singleton AI engine now disposes worker threads efficiently.

## [0.3.3] - Product Repositioning — In-IDE Scratch Pad - 2026-04-10

### 🔄 Repositioning: Prompt Manager → In-IDE Scratch Pad

No functional changes. Documentation and marketplace metadata updated to reflect the extension's primary use case: capturing next tasks while your AI agent runs, without breaking flow.

- **Display name**: `Quick Prompt - AI Prompt Manager & Clipboard History` → `Quick Prompt - Capture Ideas & Queue Tasks While AI Works`
- **README** (EN + zh-TW + zh-CN): Rewritten to lead with the cognitive offload use case.
- **Why**: The original "prompt template library" framing was increasingly irrelevant as AI IDEs absorb context injection at the infrastructure level. The durable value is the **asynchronous cognitive handoff**: human thinks ahead, AI executes behind, Quick Prompt holds the queue.

## [0.3.2] - Privacy v2 — Secure Storage Redesign - 2026-04-07

### 🔒 Privacy v2 — Secure Storage Redesign

The token mapping needed to reverse a mask is now stored in VS Code's **SecretStorage** (OS-level encrypted: macOS Keychain, Windows Credential Manager, Linux libsecret) instead of `prompts.json`. Sensitive data no longer touches the file system in any form.

- **`prompts.json`**: Masked entries now store only `maskedAt` and `types` in `privacyMeta` — the `tokenMap` field is gone from disk entirely.
- **Prompt deletion**: Deleting a prompt now also cleans up its SecretStorage entry.
- **Limitation**: Unmask is machine-local — a masked prompt cannot be unmasked on a different machine.

**Breaking changes:**

- `privacy-dictionary.json` and the custom dictionary feature removed. Pattern toggles remain in Settings.
- MCP tools `mask_text`, `unmask_text`, `list_dictionary`, `add_dictionary_entry`, `edit_dictionary_entry`, `delete_dictionary_entry`, `toggle_dictionary_entry` **removed**. Privacy masking is a VS Code-side operation and must not be exposed to external agents.
- "Preview Privacy Masking" WebView panel removed.
- Unmask right-click action no longer shows a confirmation dialog.

## [0.3.1] - Clipboard Masking Scope Fix - 2026-04-06

### 🛡️ Clipboard Masking Scope Fix

- **Masking scope corrected**: Sensitive data masking now applies only at the prompt insertion layer, not at clipboard capture time. Previously, captured clipboard content was silently overwritten with a masked version, making the original irretrievable. Clipboard history now always stores the original content; masking is applied on-demand at insertion.

## [0.3.0] - AI Agent Integration (MCP) & Privacy Protection - 2026-03-19

### 🔌 AI Agent Integration via MCP

- **MCP Server**: A bundled MCP server enables AI agents (Cursor, Claude, Antigravity) to manage prompts directly via 21 tools across prompt CRUD, version history, and privacy masking.
- **4-Layer Safety Decision Tree**: Generated skills implement Layer 0–3 safety logic to ensure agents only take actions when the connection is secure.
- **Skill Generator**: Generates tailored skill files for Cursor (`.mdc`), Copilot, Claude, Antigravity, Kiro, and Cline.
- **CLI Fallback Bundle** (`qp.bundle.js`): Self-contained fallback if the MCP server is disconnected.
- **MCP Config Panel**: Interactive WebView for easy setup with multi-root workspace support and dynamic folder variables.

### 🔒 Privacy Protection — Sensitive Data Masking

- **Mask Clipboard** (`Quick Prompt: Mask Clipboard`): Detects and replaces sensitive data with reversible tokens (e.g. `[EMAIL-1]`, `[API-KEY-1]`).
- **Unmask Clipboard** (`Quick Prompt: Unmask Clipboard`): Restores original values from secure session storage.
- **Preview Masking** (`Quick Prompt: Preview Masking`): Interactive WebView showing exactly what would be masked before you commit.
- **Custom Dictionary** (`Quick Prompt: Manage Privacy Dictionary`): Add exact-match or regex patterns; select text and run `Add to Privacy Dictionary` to register instantly.
- **Pattern coverage** (enabled by default): email, phone, API keys (AWS/GitHub/OpenAI), IP addresses, private keys/certificates. Credit cards off by default.
- **NER Support** (optional): AI-powered named entity detection for names, orgs, and locations via `quickPrompt.privacy.ner.*`.

### 🔧 Caching & Path Resolution Fixes

- **VersionManager caching**: Improved caching for faster history loading.
- **Windows path resolution**: Fixed path resolution for Windows in MCP environments.

## [0.2.0] - Version History System - 2026-01-21

### 📜 Version History System

- **Linear History**: Automatically tracks every change to your prompts.
- **Soft Checkout**: Apply historical versions without overwriting until you save (with dirty check safety).
- **Milestones**: Tag important versions (e.g. "Stable", "Draft v2").
- **Diff View**: Compare any historical version with the current state in one click.
- **Smart Retention**: Auto-prunes old versions for storage efficiency (keeps last 15 + milestones + restores).
- **i18n**: Full English, Traditional Chinese, and Simplified Chinese support.

### 🔧 Security & Reliability

- **Path traversal protection**: Added protection for prompt history file paths.
- **Resource cleanup**: Improved AI engine resource cleanup on deactivation.
- **Command naming**: Unified command naming conventions across the extension.
- **History tree**: Optimized partial updates for history tree view performance.

## [0.1.1] - Non-blocking AI Title Generation - 2026-01-16

### ⚡ Non-blocking AI Title Generation

- **Progressive title generation**: Prompts are added immediately with a fallback title; AI generates a better title in the background.
- **Non-blocking UI**: Fixed AI title generation freezing the VS Code interface.
- **Silent mode**: Pinned and auto-added prompts work silently without interrupting flow.
- **Reversible AI titles**: A notification allows reverting to the original title when AI updates it.

## [0.1.0] - AI-Powered Title Generation - 2026-01-16

### 🤖 AI-Powered Title Generation

- **Local AI title generation**: Automatically generates smart titles using local AI (Qwen1.5-0.5B). Works with `Alt+Shift+S` quick add and clipboard pinning.
- **Privacy-first**: All processing runs on your machine, no internet required. First-time download: ~300 MB (cached for future use).
- **Configuration**: `quickPrompt.ai.enabled` (default: true), `quickPrompt.ai.autoGenerateTitle` (default: true).
- **Removed**: AI tag suggestion system (simplified to focus on title generation).

## [0.0.3] - Clipboard History & Unified Search - 2025-12-04

### 📋 Automatic Clipboard History

- **Instant capture**: Automatically captures clipboard content from VS Code editor copies with no delay; polls every 5 s (configurable) for external app copies.
- **Smart filtering**: Automatic deduplication, minimum length filter (default: 10 chars), excludes pure numbers.

### 🔍 Unified Search Interface (`Alt+P`)

- **Single search box**: Search both prompts and clipboard history in one place — "My Prompts" section first, "Clipboard History" below.
- **Quick actions**: Press Enter to copy the selected item directly.

### ↕️ Manual Sorting & Enhanced Editing

- **Manual sorting**: Move prompts up or down via right-click menu; order is saved automatically with a 2-second status bar confirmation.
- **Clipboard item editing**: Edit button on clipboard items auto-converts to a permanent prompt and opens in the native editor.
- **Hover preview**: Rich preview cards when hovering over virtual files.

### 🎨 Inline Action Buttons & Status Bar

- **Prompt items**: Copy, Pin/Unpin, Edit, Delete.
- **Clipboard items**: Copy, Pin to Prompts, Edit as Prompt, Remove from History.
- **Status bar**: Clipboard indicator with click-to-search and hover preview of latest item.
- **Minimalist notifications**: Quick operations use 2–3 s status bar messages; no confirmation dialogs for delete.

### ⚙️ Configuration & Technical

- **New settings**: `quickPrompt.clipboardHistory.enabled`, `maxItems` (20), `enablePolling`, `pollingInterval` (5000 ms), `minLength` (10).
- **Instant VS Code capture**: Selection listener with 200 ms delay for reliable clipboard sync.
- **i18n**: All new features translated in English, Traditional Chinese, and Simplified Chinese.

## [0.0.2] - Sidebar UI & Stability Fixes - 2025-12-03

### 🎨 Sidebar UI & Stability Fixes

- **UI improvements**: Enhanced sidebar icons, visual indicators, and prompt display formatting.
- **Pin functionality**: Added pin support for important prompts.
- **Bug fixes**: Fixed workspace isolation issues, improved file system provider stability, and better error handling for edge cases.

## [0.0.1] - Initial Release - 2025-12-02

### 🎉 Initial Release

- **Quick search & copy** (`Alt+P`): Search prompts with smart filters (`@hot`, `@recent`, `@unused`); press Enter to copy directly to clipboard.
- **Quick add** (`Alt+Shift+S`): Add from text selection with `Title::Content` syntax and auto-title generation.
- **Virtual file system**: Each prompt is a virtual file (`quickprompt:/001.md`) with full VS Code editing (Ctrl+S to save, Undo/Redo, Auto Save).
- **Smart tracking**: Usage count, last-used time, and visual indicators (🔥 Hot, ⭐ Frequent, 📝 Normal, ⚪ Unused).
- **Pin function**: Important prompts pinned to the top.
- **Workspace isolation**: Each project has its own `.vscode/prompts.json`.
