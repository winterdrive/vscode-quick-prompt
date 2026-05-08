/**
 * QuickPrompt MCP Server Implementation
 *
 * This file is responsible for:
 * - Initializing the low-level MCP Server (Logging / Prompts / Resources / Tools)
 * - Registering 14 tools covering prompt CRUD and version history
 * - Handling tool call requests and routing them to Tool classes
 * - Supporting the MCP Roots protocol for dynamically obtaining the workspace path
 * - Structured MCP Logging
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  LoggingLevel,
  ReadResourceRequestSchema,
  RootsListChangedNotificationSchema,
  SetLevelRequestSchema,
  type Root,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { zodToJsonSchema } from './utils/zodToJsonSchema.js';
import { toMcpResult, createError } from './utils/ResponseFactory.js';
import { ErrorType } from './types.js';
import { PromptManager } from '../../src/core/PromptManager.js';
import { VersionManager } from '../../src/core/VersionManager.js';
import { PromptTools } from './tools/promptTools.js';
import { VersionTools } from './tools/versionTools.js';
import { ClipboardTools } from './tools/clipboardTools.js';

const SERVER_NAME = 'quickprompt';
const SERVER_VERSION = '0.1.0';

// ── Logging ────────────────────────────────────────────────────────────────────

const LOG_LEVEL_ORDER: LoggingLevel[] = [
  'debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency',
];

// ── Tool definitions (Zod schemas) ─────────────────────────────────────────────

const TOOL_DEFS = {
  // ── Prompt Management ──────────────────────────────────────────────────────
  list_prompts: {
    description: 'List all prompts with summary information including id, title, use_count, pinned status, and creation time.',
    schema: {},
  },
  get_prompt: {
    description: 'Get a single prompt by ID. Returns full content plus metadata.',
    schema: {
      id: z.string().describe('The unique prompt ID.'),
    },
  },
  create_prompt: {
    description: 'Create a new prompt with title and content. Returns the newly created prompt.',
    schema: {
      title: z.string().describe('The prompt title.'),
      content: z.string().describe('The prompt content text.'),
      pinned: z.boolean().optional().describe('Whether to pin the prompt (default: false).'),
    },
  },
  edit_prompt: {
    description: 'Edit an existing prompt. Supports updating title and/or content. Automatically creates a version history entry for content changes.',
    schema: {
      id: z.string().describe('The prompt ID to edit.'),
      title: z.string().optional().describe('New title (omit to keep unchanged).'),
      content: z.string().optional().describe('New content (omit to keep unchanged).'),
    },
  },
  delete_prompt: {
    description: 'Delete a prompt by ID. Also deletes its version history.',
    schema: {
      id: z.string().describe('The prompt ID to delete.'),
    },
  },
  toggle_pin: {
    description: 'Toggle the pinned state of a prompt.',
    schema: {
      id: z.string().describe('The prompt ID to toggle pin.'),
    },
  },
  move_prompt: {
    description: 'Move a prompt up or down in the display order.',
    schema: {
      id: z.string().describe('The prompt ID to move.'),
      direction: z.enum(['up', 'down']).describe('Direction to move: "up" or "down".'),
    },
  },
  search_prompts_fuzzy: {
    description: 'Fuzzy semantic search for prompts based on user\'s spoken or typed intent. Matches against titles and content. Use this to heavily tolerate homophones (e.g. from speech-to-text) or fat-finger typos.',
    schema: {
      query: z.string().describe('The natural language spoken keyword or fuzzy concept to search for.'),
    },
  },
  copy_prompt_content: {
    description: 'Get the content of a prompt ready for clipboard use. Increments use_count.',
    schema: {
      id: z.string().describe('The prompt ID to copy.'),
    },
  },

  // ── Version History ──────────────────────────────────────────────────────────
  list_versions: {
    description: 'List all version history entries for a specific prompt, including milestones.',
    schema: {
      promptId: z.string().describe('The prompt ID to list versions for.'),
    },
  },
  get_version: {
    description: 'Get the content of a specific version.',
    schema: {
      promptId: z.string().describe('The prompt ID.'),
      versionId: z.string().describe('The version ID to retrieve.'),
    },
  },
  apply_version: {
    description: 'Restore a prompt to a specific version. The current content is saved as a new version before restoring.',
    schema: {
      promptId: z.string().describe('The prompt ID.'),
      versionId: z.string().describe('The version ID to restore to.'),
    },
  },
  delete_version: {
    description: 'Delete a specific version entry. The most recent version cannot be deleted.',
    schema: {
      promptId: z.string().describe('The prompt ID.'),
      versionId: z.string().describe('The version ID to delete.'),
    },
  },
  tag_milestone: {
    description: 'Tag a version as a named milestone. Milestones are protected from automatic pruning.',
    schema: {
      promptId: z.string().describe('The prompt ID.'),
      versionId: z.string().describe('The version ID to tag.'),
      name: z.string().describe('The milestone name (e.g., "v1.0", "before-refactor").'),
    },
  },
  rename_milestone: {
    description: 'Rename an existing milestone.',
    schema: {
      promptId: z.string().describe('The prompt ID.'),
      versionId: z.string().describe('The version ID.'),
      newName: z.string().describe('The new milestone name.'),
    },
  },
  remove_milestone: {
    description: 'Remove the milestone tag from a version (the version itself is kept).',
    schema: {
      promptId: z.string().describe('The prompt ID.'),
      versionId: z.string().describe('The version ID to un-tag.'),
    },
  },

  // ── Clipboard History ────────────────────────────────────────────────────────
  get_clipboard_item: {
    description: 'Get a specific clipboard history item by its index. ALways translate the user\'s oral/natural language reference (e.g., "second copy", "拷貝二號") into the corresponding integer index (0, 1, 2...).',
    schema: {
      index: z.number().describe('The 0-based integer index of the clipboard item (0 is the most recent).'),
    },
  },

};

// ── Prompt templates ────────────────────────────────────────────────────────────

const PROMPT_DEFS = [
  {
    name: 'quickprompt:organize-prompts',
    description: 'Guide the AI to review and organize prompts — clean up duplicates, improve titles, and pin frequently used ones.',
    arguments: [],
  },
  {
    name: 'quickprompt:version-review',
    description: 'Guide the AI to review version history of a prompt, identify key milestones, and clean up old versions.',
    arguments: [
      {
        name: 'promptId',
        description: 'The prompt ID to review versions for.',
        required: true,
      },
    ],
  },
];

// ── Resource definitions ────────────────────────────────────────────────────────

const CONSOLIDATED_RESOURCE = {
  uri: 'quickprompt://docs/complete',
  name: 'QuickPrompt Complete Reference',
  description: 'The single authoritative reference for QuickPrompt MCP: data schema, safety rules, privacy masking patterns, and prompt management best practices.',
  mimeType: 'text/markdown',
};

const CONSOLIDATED_CONTENT = `# QuickPrompt Complete Reference

> The single authoritative reference for QuickPrompt MCP. Read this before performing any operation.

---

## 1. Data Structure

### prompts.json (.vscode/prompts.json)
\`\`\`json
{
  "prompts": [
    {
      "id": "uuid",
      "title": "Prompt Title",
      "content": "The full prompt text...",
      "use_count": 0,
      "last_used": null,
      "created_at": "2024-01-01T00:00:00.000Z",
      "pinned": false,
      "order": 0,
      "titleSource": "user|ai",
      "meta": {}
    }
  ]
}
\`\`\`

### Version History (.vscode/.quickprompt/history/<id>.history.json)
\`\`\`json
{
  "promptId": "uuid",
  "versions": [
    {
      "versionId": "uuid",
      "content": "versioned content...",
      "timestamp": "ISO8601",
      "changeType": "create|edit|restore",
      "milestone": { "label": "v1.0", "createdAt": 1704067200000 }
    }
  ]
}
\`\`\`

### Privacy Dictionary (.vscode/privacy-dictionary.json)
Array of: \`{ id, pattern, isRegex, label, enabled, note, createdAt, updatedAt }\`

---

## 2. Safety Rules

1. **Optimistic locking** — all writes check file mtime. On conflict, operations retry up to 3 times.
2. **Workspace boundary** — all file paths are resolved within the workspace root. No escaping allowed.
3. **Version protection** — the most recent version cannot be deleted. Milestones are protected from auto-pruning.
4. **Privacy first** — when handling user content, always offer to mask sensitive data before sharing.
5. **Backup on corruption** — if prompts.json is corrupted, the system auto-recovers from backup.

---

## 3. Privacy Masking Patterns

The following sensitive data types are automatically detected and masked:
- Email addresses, phone numbers, IP addresses (v4 & v6)
- Credit card numbers, Social Security Numbers
- API keys and tokens (Bearer, AWS, GitHub, Slack, Stripe, etc.)
- URLs with credentials, JWT tokens
- Private keys (PEM format), passwords in connection strings
- Custom dictionary words (user-defined, highest priority)

---

## 4. Common Workflows

### Prompt Management
1. \`list_prompts\` — view all prompts
2. \`create_prompt\` — create a new prompt
3. \`edit_prompt\` — modify content (auto-creates version)
4. \`search_prompts\` — find prompts by keyword
5. \`copy_prompt_content\` — copy content and track usage

### Version Control
1. \`list_versions\` — see all versions for a prompt
2. \`tag_milestone\` — mark important versions
3. \`apply_version\` — restore a previous version
4. \`delete_version\` — remove unneeded versions

`;

// ── QuickPromptMCPServer ───────────────────────────────────────────────────────

export class QuickPromptMCPServer {
  private server: Server;
  private workspaceRoot?: string;
  private currentLogLevel?: LoggingLevel = process.env.QUICKPROMPT_MCP_DEBUG ? 'debug' : undefined;

  // Core managers
  private promptManager?: PromptManager;
  private versionManager?: VersionManager;

  // Tool handlers
  private promptTools?: PromptTools;
  private versionTools?: VersionTools;
  private clipboardTools: ClipboardTools;

  constructor(workspaceRoot?: string) {
    this.clipboardTools = new ClipboardTools();
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        capabilities: {
          tools: { listChanged: true },
          prompts: { listChanged: false },
          resources: {},
          logging: {},
        },
      },
    );

    if (workspaceRoot) {
      this.updateWorkspaceRoot(workspaceRoot);
    }

    this.registerHandlers();
  }

  // ── Logging ──────────────────────────────────────────────────────────────────

  private shouldLog(level: LoggingLevel): boolean {
    if (!this.currentLogLevel) return false;
    return LOG_LEVEL_ORDER.indexOf(level) >= LOG_LEVEL_ORDER.indexOf(this.currentLogLevel);
  }

  private log(level: LoggingLevel, message: string, data?: unknown): void {
    if (this.shouldLog(level)) {
      console.error(`[${level.toUpperCase()}] ${message}`, data !== undefined ? data : '');
      void this.server.sendLoggingMessage({ level, data: data !== undefined ? { message, data } : { message } });
    }
  }

  // ── Workspace ─────────────────────────────────────────────────────────────────

  private updateWorkspaceRoot(newWorkspaceRoot: string): void {
    this.workspaceRoot = path.resolve(newWorkspaceRoot);

    // Initialize core managers
    this.promptManager = new PromptManager(this.workspaceRoot);
    this.versionManager = new VersionManager(this.workspaceRoot);

    // Initialize tool handlers
    this.promptTools = new PromptTools(this.promptManager, this.versionManager);
    this.versionTools = new VersionTools(this.versionManager, this.promptManager);

    this.log('info', `Workspace root updated: ${this.workspaceRoot}`);
  }

  private async updateWorkspaceFromRoots(roots: Root[]): Promise<void> {
    if (!roots || roots.length === 0) {
      this.log('warning', 'Client did not provide any roots');
      return;
    }

    const firstRoot = roots[0];
    let rootPath = firstRoot.uri;

    // Strip file:// scheme
    if (rootPath.startsWith('file://')) {
      rootPath = rootPath.slice(7);
      // Handle Windows drive letter: /C:/... → C:/...
      if (rootPath.startsWith('/') && rootPath.charAt(2) === ':') {
        rootPath = rootPath.slice(1);
      }
    }

    try {
      const stats = await fs.promises.stat(rootPath);
      if (stats.isDirectory()) {
        this.updateWorkspaceRoot(rootPath);
        this.log('info', `Workspace set from MCP Roots: ${rootPath}`);
      } else {
        this.log('warning', `Root path is not a directory: ${rootPath}`);
      }
    } catch (error) {
      this.log('error', `Cannot access root path ${rootPath}`, error instanceof Error ? error.message : String(error));
    }
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }

  // ── Tool call wrapper ─────────────────────────────────────────────────────────

  private async wrap<T>(fn: () => Promise<T> | T) {
    if (!this.workspaceRoot) {
      return toMcpResult(createError(
        ErrorType.NOT_INITIALIZED,
        'Workspace not initialized. Please ensure the client supports the MCP Roots protocol, or specify a workspace path via command-line arguments.',
      ));
    }
    try {
      const result = await fn();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return toMcpResult(createError(
        ErrorType.INTERNAL_ERROR,
        error instanceof Error ? error.message : String(error),
      ));
    }
  }

  /** Parse and validate tool arguments through the tool's Zod schema. */
  private parseArgs<S extends z.ZodRawShape>(schema: S, args: unknown): z.infer<z.ZodObject<S>> {
    return z.object(schema).parse(args ?? {});
  }

  // ── Register all MCP handlers ─────────────────────────────────────────────────

  private registerHandlers(): void {
    // 1. Logging level
    this.server.setRequestHandler(SetLevelRequestSchema, async ({ params }) => {
      this.currentLogLevel = params.level;
      this.log('info', `Log level set to: ${params.level}`);
      return {};
    });

    // 2. Tools — list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Object.entries(TOOL_DEFS).map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: zodToJsonSchema(def.schema),
      })),
    }));

    // 3. Tools — call
    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params;
      this.log('debug', `call_tool: ${name}`, args);

      switch (name) {
        // ── Prompt Management ──────────────────────────────────────────────
        case 'list_prompts':
          return this.wrap(() => this.promptTools!.listPrompts());
        case 'get_prompt':
          return this.wrap(() => this.promptTools!.getPrompt(this.parseArgs(TOOL_DEFS.get_prompt.schema, args)));
        case 'create_prompt':
          return this.wrap(() => this.promptTools!.createPrompt(this.parseArgs(TOOL_DEFS.create_prompt.schema, args)));
        case 'edit_prompt':
          return this.wrap(() => this.promptTools!.editPrompt(this.parseArgs(TOOL_DEFS.edit_prompt.schema, args)));
        case 'delete_prompt':
          return this.wrap(() => this.promptTools!.deletePrompt(this.parseArgs(TOOL_DEFS.delete_prompt.schema, args)));
        case 'toggle_pin':
          return this.wrap(() => this.promptTools!.togglePin(this.parseArgs(TOOL_DEFS.toggle_pin.schema, args)));
        case 'move_prompt':
          return this.wrap(() => this.promptTools!.movePrompt(this.parseArgs(TOOL_DEFS.move_prompt.schema, args)));
        case 'search_prompts_fuzzy':
          return this.wrap(() => this.promptTools!.searchPrompts(this.parseArgs(TOOL_DEFS.search_prompts_fuzzy.schema, args)));
        case 'copy_prompt_content':
          return this.wrap(() => this.promptTools!.copyPromptContent(this.parseArgs(TOOL_DEFS.copy_prompt_content.schema, args)));

        // ── Version History ────────────────────────────────────────────────
        case 'list_versions':
          return this.wrap(() => this.versionTools!.listVersions(this.parseArgs(TOOL_DEFS.list_versions.schema, args)));
        case 'get_version':
          return this.wrap(() => this.versionTools!.getVersion(this.parseArgs(TOOL_DEFS.get_version.schema, args)));
        case 'apply_version':
          return this.wrap(() => this.versionTools!.applyVersion(this.parseArgs(TOOL_DEFS.apply_version.schema, args)));
        case 'delete_version':
          return this.wrap(() => this.versionTools!.deleteVersion(this.parseArgs(TOOL_DEFS.delete_version.schema, args)));
        case 'tag_milestone':
          return this.wrap(() => this.versionTools!.tagMilestone(this.parseArgs(TOOL_DEFS.tag_milestone.schema, args)));
        case 'rename_milestone':
          return this.wrap(() => this.versionTools!.renameMilestone(this.parseArgs(TOOL_DEFS.rename_milestone.schema, args)));
        case 'remove_milestone':
          return this.wrap(() => this.versionTools!.removeMilestone(this.parseArgs(TOOL_DEFS.remove_milestone.schema, args)));

        // ── Clipboard History ──────────────────────────────────────────────
        case 'get_clipboard_item':
          return this.wrap(() => this.clipboardTools.getClipboardItem(this.parseArgs(TOOL_DEFS.get_clipboard_item.schema, args)));

        default:
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
            isError: true,
          };
      }
    });

    // 4. Prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: PROMPT_DEFS,
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (req) => {
      const { name, arguments: args } = req.params;
      switch (name) {
        case 'quickprompt:organize-prompts': {
          return {
            description: PROMPT_DEFS[0].description,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: [
                    'Please review and organize my QuickPrompt library.',
                    '',
                    'Steps:',
                    '1. Call `list_prompts` to see all prompts.',
                    '2. Identify duplicates or near-duplicates.',
                    '3. Suggest better titles for unclear entries.',
                    '4. Pin high-usage prompts that are not yet pinned.',
                    '5. Provide a summary of recommended changes.',
                  ].join('\n'),
                },
              },
            ],
          };
        }
        case 'quickprompt:version-review': {
          const promptId = args?.promptId ?? '<prompt-id>';
          return {
            description: PROMPT_DEFS[1].description,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: [
                    `Please review the version history for prompt "${promptId}".`,
                    '',
                    'Steps:',
                    '1. Call `list_versions` to see all versions.',
                    '2. Identify significant changes worthy of milestone tags.',
                    '3. Call `tag_milestone` on important versions.',
                    '4. Suggest which old versions can be safely deleted.',
                    '5. Provide a timeline summary.',
                  ].join('\n'),
                },
              },
            ],
          };
        }
        default:
          throw new Error(`Unknown Prompt: ${name}`);
      }
    });

    // 5. Resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [CONSOLIDATED_RESOURCE],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
      const { uri } = req.params;
      switch (uri) {
        case 'quickprompt://docs/complete':
          return {
            contents: [{
              uri,
              mimeType: CONSOLIDATED_RESOURCE.mimeType,
              text: CONSOLIDATED_CONTENT,
            }],
          };
        default:
          throw new Error(`Unknown Resource URI: ${uri}`);
      }
    });

    // 6. Roots protocol (listen for workspace path changes from clients)
    this.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
      try {
        this.log('debug', 'Received roots/list_changed notification, requesting updated roots...');
        const response = await this.server.listRoots();
        if (response && 'roots' in response) {
          await this.updateWorkspaceFromRoots(response.roots);
        }
      } catch (error) {
        this.log('error', 'Failed to get roots from client', error instanceof Error ? error.message : String(error));
      }
    });
  }

  // ── Connect ──────────────────────────────────────────────────────────────────

  async connect(transport: Transport): Promise<void> {
    this.server.oninitialized = async () => {
      const clientCapabilities = this.server.getClientCapabilities();
      const clientVersion = this.server.getClientVersion();
      this.log('info', `Client connected: ${clientVersion?.name ?? '<unknown>'} ${clientVersion?.version ?? ''}`);

      if (clientCapabilities?.roots) {
        try {
          this.log('debug', 'Client supports MCP Roots, requesting workspace path...');
          const response = await this.server.listRoots();
          if (response && 'roots' in response) {
            await this.updateWorkspaceFromRoots(response.roots);
          } else {
            this.log('warning', 'Client did not provide roots');
          }
        } catch (error) {
          this.log('error', 'Failed to get initial roots from client', error instanceof Error ? error.message : String(error));
          if (!this.workspaceRoot) {
            this.log('error', 'Warning: no workspace path — MCP tools will not be available');
          }
        }
      } else {
        this.log('notice', 'Client does not support MCP Roots protocol');
        if (!this.workspaceRoot) {
          this.log('error', 'Error: cannot obtain workspace path. Please specify one via command-line arguments, or use a client that supports MCP Roots.');
        } else {
          this.log('info', `Using command-line specified workspace: ${this.workspaceRoot}`);
        }
      }
    };

    await this.server.connect(transport);
  }
}
