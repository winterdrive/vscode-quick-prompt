/**
 * QuickPrompt MCP Server entry point
 *
 * Responsibilities:
 * - Parse optional command-line arguments (--workspace-root)
 * - Persist workspace path across sessions (~/.quickprompt-mcp-state.json)
 * - Initialise QuickPromptMCPServer (supports MCP Roots protocol)
 * - Create the stdio transport and connect
 */

import * as fs from 'fs';
import * as path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { QuickPromptMCPServer } from './server.js';
import { loadState, saveState } from './stateStore.js';

/**
 * Parse optional command-line arguments.
 * Supports: --workspace-root=<path> | --workspace-root <path> | <path>
 */
function parseArgs(): { workspaceRoot?: string } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return { workspaceRoot: undefined };
  }

  let workspaceRoot: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--workspace-root=')) {
      workspaceRoot = arg.slice('--workspace-root='.length);
      break;
    }
    if (arg === '--workspace-root') {
      const idx = args.indexOf(arg);
      if (idx !== -1 && idx < args.length - 1) {
        workspaceRoot = args[idx + 1];
        break;
      }
    }
  }

  // Fallback: first positional argument
  if (!workspaceRoot && args.length > 0 && !args[0].startsWith('-')) {
    workspaceRoot = args[0];
  }

  return { workspaceRoot };
}

/**
 * Validate that a workspace path exists and is a directory.
 */
function validateWorkspaceRoot(workspaceRoot: string): boolean {
  try {
    if (!fs.existsSync(workspaceRoot)) {
      console.error(`[WARNING] Workspace path does not exist: ${path.basename(workspaceRoot)}`);
      return false;
    }
    const stats = fs.statSync(workspaceRoot);
    if (!stats.isDirectory()) {
      console.error(`[WARNING] Workspace path is not a directory: ${path.basename(workspaceRoot)}`);
      return false;
    }
    return true;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
    console.error(`[WARNING] Failed to validate workspace path: ${path.basename(workspaceRoot)}${code ? ` (${code})` : ''}`);
    return false;
  }
}

/**
 * Main entry point.
 */
async function main() {
  try {
    // 1. Parse command-line arguments
    const { workspaceRoot: cliRoot } = parseArgs();

    // 2. Load cached state
    const state = loadState();

    // 3. Determine initial workspace root (priority: CLI arg > cache)
    let validatedWorkspaceRoot: string | undefined;

    if (cliRoot && validateWorkspaceRoot(cliRoot)) {
      validatedWorkspaceRoot = path.resolve(cliRoot);
      console.error(`[INFO] Using command-line workspace: ${path.basename(validatedWorkspaceRoot)}`);
    } else if (state.lastWorkspaceRoot && validateWorkspaceRoot(state.lastWorkspaceRoot)) {
      validatedWorkspaceRoot = state.lastWorkspaceRoot;
      console.error(`[INFO] Using cached workspace path: ${path.basename(validatedWorkspaceRoot)}`);
    }

    // 4. Create the QuickPrompt MCP Server
    const server = new QuickPromptMCPServer(validatedWorkspaceRoot);

    // 5. Persist workspace root when the Roots protocol sets it.
    // Polling after 3s gives the Roots handshake time to complete.
    setTimeout(() => {
      const root = server.getWorkspaceRoot();
      if (root) {
        saveState({ lastWorkspaceRoot: root });
        console.error(`[INFO] Workspace path cached: ${path.basename(root)}`);
      }
    }, 3000);

    // 6. Create the stdio transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[INFO] QuickPrompt MCP Server started successfully');
    if (!validatedWorkspaceRoot) {
      console.error('[INFO] Waiting for client to supply workspace path via MCP Roots protocol...');
    }
  } catch (error) {
    console.error('[ERROR] Server startup failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[ERROR] Unexpected error:', error);
  process.exit(1);
});
