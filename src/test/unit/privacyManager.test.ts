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

        // Regression for #63: a shorter custom-dictionary label that is a
        // literal substring of a longer one must not be restored first, or
        // it corrupts the still-unprocessed longer occurrence (here,
        // "[SECRET]" is a true substring of "[SECRET]-BACKUP" — unlike the
        // issue's original "[SECRET]"/"[SECRET-CODE]" example, which isn't
        // actually a substring pair since "]" never lines up). Covers both
        // dictionary-insertion orders since the bug depended on Map
        // iteration order.
        it('restores both values correctly when one label is a substring of another (shorter label added first)', () => {
            manager.addDictionaryEntry({ pattern: 'sk_live_111', isRegex: false, label: '[SECRET]', enabled: true });
            manager.addDictionaryEntry({ pattern: 'sk_live_222', isRegex: false, label: '[SECRET]-BACKUP', enabled: true });

            const original = 'key sk_live_111 and code sk_live_222 must both roundtrip.';
            const { maskedText } = manager.maskText(original);

            expect(manager.unmaskText(maskedText)).toBe(original);
        });

        it('restores both values correctly when one label is a substring of another (longer label added first)', () => {
            manager.addDictionaryEntry({ pattern: 'sk_live_222', isRegex: false, label: '[SECRET]-BACKUP', enabled: true });
            manager.addDictionaryEntry({ pattern: 'sk_live_111', isRegex: false, label: '[SECRET]', enabled: true });

            const original = 'key sk_live_111 and code sk_live_222 must both roundtrip.';
            const { maskedText } = manager.maskText(original);

            expect(manager.unmaskText(maskedText)).toBe(original);
        });
    });

    // ── dictionary file shape guard ──────────────────────────────────────────

    describe('dictionary CRUD with malformed privacy-dictionary.json', () => {
        const writeDictionaryFile = (content: string) => {
            const dictDir = path.join(tmpDir, '.vscode');
            fs.mkdirSync(dictDir, { recursive: true });
            fs.writeFileSync(path.join(dictDir, 'privacy-dictionary.json'), content, 'utf-8');
        };

        it('falls back to an empty dictionary instead of throwing when entries is missing', () => {
            writeDictionaryFile('{}');

            expect(manager.getDictionaryEntries()).toEqual([]);
            expect(() =>
                manager.addDictionaryEntry({ pattern: 'ACME', isRegex: false, label: '[COMPANY]', enabled: true })
            ).not.toThrow();
        });

        it('falls back to an empty dictionary instead of throwing when entries is null', () => {
            writeDictionaryFile(JSON.stringify({ version: '1.0', entries: null }));

            expect(manager.getDictionaryEntries()).toEqual([]);
        });

        it('falls back to an empty dictionary instead of throwing when the file is a bare array', () => {
            writeDictionaryFile('[]');

            expect(manager.getDictionaryEntries()).toEqual([]);
        });
    });
});
