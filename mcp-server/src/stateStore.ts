/**
 * QuickPrompt MCP Server persisted state helpers.
 *
 * Isolated from index.ts (no dependency on the MCP SDK / server graph) so that
 * loadState()/saveState() can be unit-tested in isolation without pulling in
 * the whole stdio transport + tool registration machinery.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** Default state file location: ~/.quickprompt-mcp-state.json */
export const STATE_FILE = path.join(os.homedir(), '.quickprompt-mcp-state.json');

export interface McpState {
  lastWorkspaceRoot?: string;
}

/**
 * Load persisted state from disk.
 *
 * Guards against malformed JSON shapes (null, arrays, primitives, etc.) that
 * would otherwise flow an invalid value into callers typed as McpState -
 * falls back to an empty state object `{}` for anything that isn't a plain
 * object, as well as for any read/parse error.
 *
 * @param filePath Optional override of the state file path (used by tests).
 */
export function loadState(filePath: string = STATE_FILE): McpState {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as McpState;
      }
    }
  } catch {
    // Ignore read/parse errors; treat as empty state
  }
  return {};
}

export function saveState(state: McpState, filePath: string = STATE_FILE): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Ignore write errors (non-critical for core functionality)
  }
}
