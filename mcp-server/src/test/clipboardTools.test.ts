import * as fs from 'fs';

import { ClipboardTools } from '../tools/clipboardTools.js';

// TypeScript's CJS interop helper freezes the `fs` namespace object, so
// `jest.spyOn(fs, ...)` cannot redefine its properties. Mocking the whole
// module (keeping the real implementation for anything we don't override)
// sidesteps that and lets us control existsSync/readFileSync per test.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const mockedExistsSync = fs.existsSync as jest.Mock;
const mockedReadFileSync = fs.readFileSync as jest.Mock;

describe('ClipboardTools error message leakage', () => {
  const fakePath = 'C:\\Users\\fakeuser\\.quickprompt\\clipboard-history.json';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not leak the clipboard history file path when the fs read fails', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error(
        `EACCES: permission denied, open '${fakePath}'`
      ) as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });

    const tools = new ClipboardTools();
    const result = await tools.getClipboardItem({ index: 0 });

    expect(result.success).toBe(false);
    const message = result.success ? '' : result.message;

    // Must not leak the absolute path or the username embedded in it.
    expect(message).not.toContain(fakePath);
    expect(message).not.toContain('fakeuser');

    // Should still surface the error code so callers can diagnose the failure.
    expect(message).toContain('EACCES');
  });
});
