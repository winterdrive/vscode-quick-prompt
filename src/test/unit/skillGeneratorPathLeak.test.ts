import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SkillGenerator } from '../../mcp/SkillGenerator';

// Regression test: when dist/qp.bundle.js is missing (e.g. extension installed
// without running `npm run build:qp`), the thrown error used to embed the full
// absolute extensionPath (e.g. "/Users/<name>/.vscode/extensions/.../dist/qp.bundle.js"),
// which then surfaced as an unhandled rejection with the real filesystem path.
// The fix keeps only the file's basename in the error message.
describe('SkillGenerator qp.bundle.js missing error (path leak)', () => {
    it('does not include the absolute extension path in the thrown error message', () => {
        const context = new (vscode as any).ExtensionContext();
        context.extensionPath = path.join(os.tmpdir(), 'qp-skillgen-missing-bundle-test');

        expect(() => (SkillGenerator as any).getQpBundleContent(context)).toThrow(
            /^qp\.bundle\.js not found in extension install\. Run 'npm run build:qp' first\.$/
        );

        try {
            (SkillGenerator as any).getQpBundleContent(context);
            fail('expected getQpBundleContent to throw');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            expect(message).not.toContain(context.extensionPath);
        }
    });
});
