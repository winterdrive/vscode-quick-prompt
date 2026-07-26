import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { PrivacyManager } from '../../core/PrivacyManager';

describe('PrivacyManager', () => {
    let tmpDir: string;
    let manager: PrivacyManager;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-privacy-test-'));
        manager = new PrivacyManager(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── unmaskText ────────────────────────────────────────────────────────────

    describe('unmaskText', () => {
        it('restores every occurrence when the same value is masked multiple times', () => {
            manager.addDictionaryEntry({
                pattern: 'ACME',
                isRegex: false,
                label: '[COMPANY]',
                enabled: true,
            });

            const original = 'ACME Corp partners with ACME Inc on this project.';
            const { maskedText } = manager.maskText(original);

            expect(maskedText).toBe('[COMPANY] Corp partners with [COMPANY] Inc on this project.');
            expect(manager.unmaskText(maskedText)).toBe(original);
        });

        it('restores multiple distinct masked values', () => {
            const original = 'Contact a@example.com or b@example.com for details.';
            const { maskedText } = manager.maskText(original);

            expect(manager.unmaskText(maskedText)).toBe(original);
        });
    });
});
