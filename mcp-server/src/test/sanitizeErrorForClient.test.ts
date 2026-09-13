import { sanitizeErrorForClient } from '../server.js';

// Regression test: the generic tool-call wrapper (wrap()) in server.ts used to return
// error.message verbatim for every failed MCP tool call. Node fs errors embed the full
// absolute file path (e.g. "EACCES: permission denied, open '/Users/alice/project/.vscode/prompts.json'"),
// which leaked the user's workspace path back to the MCP client. sanitizeErrorForClient()
// collapses fs errors down to just the error code while leaving business-logic error
// messages (which don't contain paths) intact.
describe('sanitizeErrorForClient', () => {
  it('collapses a Node fs error to just its error code', () => {
    const fsError = Object.assign(new Error("EACCES: permission denied, open '/Users/alice/project/.vscode/prompts.json'"), {
      code: 'EACCES',
    });

    const message = sanitizeErrorForClient(fsError);

    expect(message).toBe('File system error (EACCES)');
    expect(message).not.toContain('/Users/alice/project');
  });

  it('passes through a business-logic error message unchanged', () => {
    const message = sanitizeErrorForClient(new Error('Prompt not found: abc123'));
    expect(message).toBe('Prompt not found: abc123');
  });

  it('stringifies a non-Error throw value', () => {
    expect(sanitizeErrorForClient('plain string failure')).toBe('plain string failure');
  });
});
