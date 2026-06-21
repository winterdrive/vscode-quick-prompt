---
name: quickprompt
description: Manages reusable prompts with version history and privacy masking via QuickPrompt MCP tools. Use this skill when the user wants to create, edit, search, or organize prompts, manage version history, tag milestones, or mask sensitive data in text content.
---

# QuickPrompt MCP Integration

This project uses QuickPrompt to manage reusable prompts with version history and privacy masking.

## MCP Server Setup

To configure the MCP server for your AI tool:
1. Open VS Code Command Palette (Ctrl+Shift+P)
2. Run: **QuickPrompt: Show MCP Config**
3. Follow the instructions for your specific AI tool

## Available Tools (17 total)

### Prompt Management (9 tools)

- `list_prompts`: List all prompts with summary info (id, title, use_count, pinned, created_at)
- `get_prompt`: Get a single prompt by ID with full content and metadata
- `create_prompt`: Create a new prompt with title and content
- `edit_prompt`: Edit title and/or content (auto-creates version history)
- `delete_prompt`: Delete a prompt and its version history
- `toggle_pin`: Toggle pinned state
- `move_prompt`: Move prompt up/down in display order
- `search_prompts_fuzzy`: Fuzzy semantic search based on spoken/typed keywords (tolerates homophones and typos)
- `copy_prompt_content`: Get content for clipboard use (increments use_count)

### Clipboard History (1 tool)

- `get_clipboard_item`: Retrieve a specific clipboard history item by integer index. Must convert the user's natural language / oral alias (e.g. "拷貝二號", "second copy") into an integer index (0-based) before calling.

### Version History (7 tools)

- `list_versions`: List all versions for a prompt including milestones
- `get_version`: Get the content of a specific version
- `apply_version`: Restore prompt to a specific version (saves current as new version first)
- `delete_version`: Delete a version entry (cannot delete most recent)
- `tag_milestone`: Tag a version as a named milestone (protected from auto-pruning)
- `rename_milestone`: Rename an existing milestone
- `remove_milestone`: Remove milestone tag (keeps the version)

## ⚡ Action Decision Tree

> ❗ **MANDATORY**: Before performing ANY QuickPrompt operation, you MUST complete Layer 0 first.

### Layer 0: MCP Connection Gate — MUST PASS BEFORE ANY OTHER ACTION

Attempt to call `list_prompts` now.

**If `list_prompts` succeeds** → MCP is working. Proceed to Layer 1 immediately.

**If `list_prompts` fails ("Tool not found" / no response / timeout)**:

> 🛑 **STOP. DO NOT PROCEED. DO NOT edit any files.**
>
> You MUST output the following message to the user and then WAIT for their response before taking any further action:
>
> ---
> **QuickPrompt MCP server is not connected.**
> To enable full functionality, please:
> 1. Open VS Code Command Palette (Ctrl+Shift+P)
> 2. Run: **QuickPrompt: Show MCP Config**
> 3. Follow the setup instructions for your AI client
> 4. Restart your AI client after configuring
>
> Would you like me to proceed with the bundled CLI fallback instead (Level 3 Hard Fallback)?
> ---
>
> Only continue to Layer 3 **if the user explicitly confirms they want the fallback**.

---

### Layer 1: Standard MCP Tools ✅ (Use whenever available)

Already listed above under "Available Tools". Always prefer these.

> 🛠️ **Voice-Ready & Typo-Tolerance Guidance**
> When the user queries for a resource (Prompt or Clipboard), they may use **Voice Input** or **Keyboard Input**. You MUST actively anticipate and correct:
> 1. **Voice Input Errors (Homophones/Phonetics)**: Example: "React" recognized as "瑞阿特", "API" recognized as "A P I". Use fuzzy semantic understanding or word-sound (諧音) associations to deduce the correct target.
> 2. **Typing Input Errors (Fat-finger/Transposition)**: Example: "reacr" (t next to r), "teh" (the).
>
> *Routing Rule*: If a user says "Get the second pasted item" (or "提取拷貝二號"), deduce the index (`index: 1` or `index: 2` depending on 0-based logic) and call `get_clipboard_item`. If they ask for a template but the spelling is strange, use `search_prompts_fuzzy`.

---

### Layer 3: Hard Fallback CLI 🚨 (Last resort — only with explicit confirmation)

Only if MCP is non-functional AND the user has explicitly confirmed they want to proceed.

Use the bundled CLI script at `skills/quickprompt/scripts/qp.bundle.js` (relative to repo root), or the equivalent `scripts/qp.bundle.js` path inside the installed skill directory:

```bash
node skills/quickprompt/scripts/qp.bundle.js list-prompts
node skills/quickprompt/scripts/qp.bundle.js add-prompt --title "My Title" --content "Prompt contents here"
node skills/quickprompt/scripts/qp.bundle.js edit-prompt 001 --content "New content"
node skills/quickprompt/scripts/qp.bundle.js remove-prompt 001
```

> If installed with `npx skills add winterdrive/QuickPrompt`, use the installed agent skill path instead (for example, `.agents/skills/quickprompt/scripts/qp.bundle.js` or `.claude/skills/quickprompt/scripts/qp.bundle.js`).
