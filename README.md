# Quick Prompt – AI Prompt Manager & Clipboard History for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/winterdrive.quick-prompt)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/winterdrive.quick-prompt)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt)
[![AI-Ready Context](https://img.shields.io/badge/AI--Ready-LLMS.txt-blue?style=flat-square)](https://winterdrive.github.io/QuickPrompt/llms.txt)

[繁體中文](./README.zh-TW.md) | [English](./README.md)

![Quick Prompt - VS Code AI Prompt Manager & Clipboard History Interface](docs/assets/hero_banner.png)

---

## 🚀 What is Quick Prompt?

**Quick Prompt is a VS Code extension that helps developers manage, organize, and instantly access AI prompts and clipboard history.** It combines a **prompt library** with **clipboard tracking**, allowing you to build a personalized database of high-quality prompts for ChatGPT, Copilot, and Claude without switching context.

---

![Feature Highlights](docs/assets/feature_highlights_v0003.png)

---

## 🔌 New in v0.3.0: AI Agent Integration (MCP)

**Full Model Context Protocol (MCP) support is now here.** Stop copy-pasting—let your AI assistant (Cursor, Copilot, Claude, etc.) manage your prompts directly with native tools.

### 🛡️ 4-Layer Safety Decision Tree

Every generated skill includes a built-in safety logic to ensure stable operation:

1. **Layer 0: Connection Gate** — Automatic check via `list_prompts`. If disconnected, the agent HALTS and asks for fallback.
2. **Layer 1: Standard MCP Tools** — Use 14 optimized tools for CRUD and versioning.
3. **Layer 2: Safety Verification** — Internal sanity checks across different prompt contexts.
4. **Layer 3: Hard Fallback CLI** — A bundled `qp.bundle.js` script allows the agent to edit `prompts.json` directly if the server is offline.

### ⚙️ Multi-Client Setup

One-click configuration for every major AI tool. Run: `Quick Prompt: Show MCP Config` to access the interactive panel.

| Cursor / Antigravity | GitHub Copilot / Cline | Kiro IDE / Claude Code |
| :------------------- | :--------------------- | :--------------------- |
| Supports `${workspaceFolder}` variables | Absolute path binding | Direct JSON configuration |

---

## ✨ Key Features

### 🔌 AI Agent Power (New!)

- **🔌 14 MCP Tools**: Complete prompt management suite for AI agents.
- **🛡️ Action Decision Tree**: Ensures agents only act when connected and safe.
- **📦 CLI Fallback Bundle**: Built-in insurance for offline scenarios.
- **⚙️ Interactive Config Panel**: Easy setup for Cursor, Copilot, Cline, Claude, and more.

### 📚 Prompt Management

- **🤖 AI-Powered Titles**: Automatic semantic title generation using local AI (Qwen1.5-0.5B).
- **🎯 Lightning Fast Search**: Press `Alt+P` to search prompts, hit Enter to copy.
- **🚀 Quick Add**: Right-click selected text → "Quick Add Prompt" (or press `Alt+Shift+S`).
- **✏️ Native Editing**: Edit prompts like regular files with full VSCode support.

### 🕒 Version Control

- **🕒 Linear History**: Automatic tracking of every save.
- **📌 Milestones**: Tag stable versions or important drafts.
- **⚖️ Visual Diff**: One-click comparison between history and current state.

### 🔒 Privacy Protection

- **🔒 Mask Prompt**: Right-click any prompt → `Mask Prompt`. Sensitive data is replaced with tokens (`[EMAIL-1]`, `[API-KEY-1]`…) in the stored content.
- **🔓 Unmask**: Right-click a masked prompt → `Unmask Prompt` to restore the original values instantly.
- **🔑 OS-Encrypted Storage**: The reverse mapping is stored in VS Code SecretStorage (OS Keychain) — persisted in encrypted form by the OS, never written to any plaintext file.

## 📸 Screenshots (AI Generated)

### Quick Search in Action

![Quick Search Demo](docs/assets/quick_search_demo.png)

*Unified search interface for both prompts and clipboard history*

### Sidebar Management

![Sidebar View](docs/assets/sidebar_view.png)

*Organized view with prompts and clipboard history*

## 🚀 Quick Start

### First Time Setup

1. Open any project folder in VSCode
2. The extension will automatically create `.vscode/prompts.json`
3. Press `Alt+P` (Mac: `Opt+P`) to start using

### Basic Usage

#### Method 1: Quick Search (Recommended) ⚡

1. Press `Alt+P` to open the unified search
2. Browse **Prompts** and **Clipboard History** in one place
3. Type keywords to filter
4. Press `Enter` to copy to clipboard
5. Paste anywhere with `Ctrl+V`

#### Method 2: Sidebar Operations 📋

1. Click the Quick Prompt icon in the Activity Bar
2. **My Prompts** section:
    - Click to copy
    - Right-click to move up/down
    - Inline buttons: Copy, Pin, Edit, Delete
3. **Clipboard History** section:
    - Click to copy
    - Pin to convert to permanent prompt
    - Inline buttons: Copy, Pin, Edit, Delete

### Icon Meanings

- 🔥: Hot (used >= 10 times)
- ⭐: Frequent (used >= 5 times)
- 📝: Normal (used > 0 times)
- ⚪: Unused
- 📌: Pinned

## 📝 Managing Prompts

### Adding Prompts

#### Method 1: Add from Selection (Fastest) 🚀

1. Select text in the editor
2. Right-click → "Quick Add Prompt" (or press `Alt+Shift+S`)
3. Done! Title is auto-generated

#### Method 2: Smart Add Mode ⚡

1. Click **➕ Add** button in sidebar
2. In the input box:
    - **Auto Mode**: Paste content directly (auto-generates title)
    - **Manual Mode**: Use `Title::Content` format
3. Done!

#### Method 3: From Clipboard History

1. Find the item in Clipboard History
2. Click the **📌 Pin** button
3. Automatically converts to permanent prompt

### Editing Prompts

- Click the **✏️ Edit** button to open in native editor
- Edit like a regular file
- Press `Ctrl+S` to save
- Full support for Undo/Redo, Auto Save, Format Document

### Organizing Prompts

- **Pin**: Click **📌** to pin important prompts to the top
- **Sort**: Right-click → Move Up/Down to manually arrange
- **Delete**: Click **🗑️** to remove (no confirmation needed)

### Using Version History (New)

1. **View History**: Expand any prompt in the sidebar.
2. **Compare**: Click on any historical version to open the **Diff View**.
3. **Restore**: Right-click a version and select **Apply Version** to bring it back.
4. **Milestones**: Tag important versions (like "V1.0 Stable") to keep them safe forever.

## 🔒 Privacy Protection – Usage Guide

Mask sensitive data before it reaches any AI model.

### How It Works

1. Add a prompt containing sensitive data — it shows a **yellow shield** warning
2. Right-click → **`Mask Prompt`**
3. Sensitive values are replaced with tokens like `[EMAIL-1]`, `[API-KEY-1]`; the prompt now shows a **green shield**
4. Copy or insert the prompt — the agent receives only tokens, never the originals
5. Right-click → **`Unmask Prompt`** to restore original values at any time

> **Security model**: The reverse mapping (token → original value) is stored in VS Code **SecretStorage** (OS Keychain / Windows Credential Manager). It is never written to `prompts.json` or any file on disk. Unmask is machine-local — switching to a different machine means a masked prompt cannot be unmasked.

### Detected Patterns (default on)

- Email addresses → `[EMAIL-1]`
- Phone numbers → `[PHONE-1]`
- API keys (AWS, GitHub, OpenAI, etc.) → `[API-KEY-1]`
- IP addresses → `[IP-ADDRESS-1]`
- Private keys / certificates → `[PRIVATE-KEY-1]`
- Credit card numbers → `[CREDIT-CARD-1]` *(default: off)*

### Privacy Settings

- `quickPrompt.privacy.enabled`: Enable/disable all privacy features (default: `true`)
- `quickPrompt.privacy.patterns.email`: Mask emails (default: `true`)
- `quickPrompt.privacy.patterns.phone`: Mask phone numbers (default: `true`)
- `quickPrompt.privacy.patterns.apiKeys`: Mask API keys (default: `true`)
- `quickPrompt.privacy.patterns.ipAddress`: Mask IP addresses (default: `true`)
- `quickPrompt.privacy.patterns.privateKey`: Mask private keys (default: `true`)
- `quickPrompt.privacy.patterns.creditCard`: Mask credit card numbers (default: `false`)

---

## 📋 Clipboard History

### Auto Capture

The extension automatically captures clipboard content from:

- **VSCode editor**: Instant capture when you copy
- **External apps**: Captured when you switch back to VSCode
- **Background polling**: Every 5 seconds (configurable)

### Smart Filtering

- ✅ Deduplication (no repeated entries)
- ✅ Minimum length filter (default: 10 characters)
- ✅ Excludes pure numbers
- ✅ Auto-clean old items (default: 7 days)

### Managing History

- **View**: Check recent items in sidebar
- **Copy**: Click to copy again
- **Pin**: Convert to permanent prompt
- **Edit**: Click edit to save as prompt and open editor
- **Delete**: Remove individual items
- **Clear All**: Click the clear button in sidebar title

## ⚙️ Configuration

### Settings

Open VSCode Settings and search for "Quick Prompt":

#### Clipboard History

- `quickPrompt.clipboardHistory.enabled`: Enable/disable auto tracking (default: `true`)
- `quickPrompt.clipboardHistory.maxItems`: Maximum history items (default: `20`)
- `quickPrompt.clipboardHistory.enablePolling`: Enable background polling (default: `true`)
- `quickPrompt.clipboardHistory.pollingInterval`: Polling interval in ms (default: `5000`)
- `quickPrompt.clipboardHistory.minLength`: Minimum content length (default: `10`)
- `quickPrompt.clipboardHistory.autoCleanDays`: Auto-clean after N days (default: `7`)

#### AI Features

- `quickPrompt.ai.enabled`: Enable/disable AI-powered features (default: `true`)
- `quickPrompt.ai.autoGenerateTitle`: Automatically generate titles using AI (default: `true`)

### File Location

- **Workspace Mode**: `.vscode/prompts.json` (independent per project)
- **Fallback Mode**: Uses extension directory if no workspace is open

### Keyboard Shortcuts

| Function           | Windows/Linux | Mac           |
|--------------------|---------------|---------------|
| Search Prompt      | `Alt+P`       | `Opt+P`       |
| Add from Selection | `Alt+Shift+S` | `Opt+Shift+S` |

## 💡 Best Practices

1. **Save on the Fly**: See a useful prompt? Select and press `Alt+Shift+S`
2. **Use Clipboard History**: Don't worry about losing copied prompts - they're auto-saved
3. **Pin Important Ones**: Convert frequently used clipboard items to permanent prompts
4. **Organize Manually**: Use right-click to arrange prompts in your preferred order
5. **Version Control**: Add `.vscode/prompts.json` to Git to share with your team

## 🎯 Use Cases

### For AI Development

- Save frequently used ChatGPT/Copilot/Claude prompts
- Quick access to debugging prompts
- Organize code review templates

### For Content Creation

- Store writing prompts and templates
- Quick access to formatting instructions
- Manage translation prompts

### For Team Collaboration

- Share best prompts via Git
- Standardize team communication with AI
- Build a prompt library together

---

## 🤝 Recommended Companion

### 🗂️ VirtualTabs

**Enhance your AI workflow.**

**Quick Prompt** helps you manage *what* to tell the AI. Pair it with **VirtualTabs** to manage *where* the AI looks.

- **Manage Context**: Group related files across directories regardless of location.
- **AI-Ready**: Create precise file sets to paste into your LLM context.

Get VirtualTabs on [**VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=winterdrive.virtual-tabs) | [**Open VSX Registry**](https://open-vsx.org/extension/winterdrive/virtual-tabs)

---

## ❤️ Support

If you find this extension helpful, please consider supporting the development!

<a href="https://ko-fi.com/Q5Q41SR5WO"><img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" height="36" alt="ko-fi" /></a>

## 📄 License

MIT License

---

**Enjoy efficient prompt management!** 🚀

*Made with ❤️ for AI developers*
