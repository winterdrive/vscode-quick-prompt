import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadState, saveState, McpState } from '../stateStore.js';

describe('stateStore', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickprompt-mcp-state-test-'));
    statePath = path.join(tmpDir, 'state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadState', () => {
    it('returns {} when the file does not exist', () => {
      expect(loadState(statePath)).toEqual({});
    });

    it('returns {} when the file contains a JSON null', () => {
      fs.writeFileSync(statePath, 'null', 'utf-8');
      expect(loadState(statePath)).toEqual({});
    });

    it('returns {} when the file contains a bare JSON array', () => {
      fs.writeFileSync(statePath, '["a", "b"]', 'utf-8');
      expect(loadState(statePath)).toEqual({});
    });

    it('returns {} when the file contains a bare JSON number', () => {
      fs.writeFileSync(statePath, '42', 'utf-8');
      expect(loadState(statePath)).toEqual({});
    });

    it('returns {} when the file contains invalid JSON', () => {
      fs.writeFileSync(statePath, '{ not valid json', 'utf-8');
      expect(loadState(statePath)).toEqual({});
    });

    it('round-trips a valid state object', () => {
      const state: McpState = { lastWorkspaceRoot: '/some/workspace' };
      saveState(state, statePath);
      expect(loadState(statePath)).toEqual(state);
    });
  });

  describe('saveState', () => {
    it('writes JSON that can be read back', () => {
      saveState({ lastWorkspaceRoot: 'C:/repo' }, statePath);
      const raw = fs.readFileSync(statePath, 'utf-8');
      expect(JSON.parse(raw)).toEqual({ lastWorkspaceRoot: 'C:/repo' });
    });
  });
});
