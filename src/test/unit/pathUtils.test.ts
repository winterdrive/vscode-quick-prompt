import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { PathUtils } from '../../core/PathUtils';

describe('PathUtils', () => {
    let tmpDir: string;
    let utils: PathUtils;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
        utils = new PathUtils(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── validatePath ──────────────────────────────────────────────────────────

    describe('validatePath', () => {
        it('accepts a file inside the workspace', () => {
            expect(utils.validatePath(path.join(tmpDir, 'prompts.json'))).toBe(true);
        });

        it('accepts a relative path that resolves inside workspace', () => {
            expect(utils.validatePath('.vscode/prompts.json')).toBe(true);
        });

        it('rejects a path outside the workspace', () => {
            expect(utils.validatePath('/etc/passwd')).toBe(false);
        });

        it('rejects path traversal attack', () => {
            expect(utils.validatePath('../outside/file.json')).toBe(false);
        });
    });

    // ── toAbsolutePath ────────────────────────────────────────────────────────

    describe('toAbsolutePath', () => {
        it('returns the same path for an already-absolute path', () => {
            const abs = path.join(tmpDir, 'file.txt');
            expect(utils.toAbsolutePath(abs)).toBe(abs);
        });

        it('resolves a relative path against the workspace root', () => {
            expect(utils.toAbsolutePath('sub/file.txt')).toBe(
                path.resolve(tmpDir, 'sub/file.txt'),
            );
        });
    });

    // ── toRelativePath ────────────────────────────────────────────────────────

    describe('toRelativePath', () => {
        it('returns relative path from workspace root', () => {
            const abs = path.join(tmpDir, 'sub', 'file.txt');
            expect(utils.toRelativePath(abs)).toBe(path.join('sub', 'file.txt'));
        });
    });

    // ── PathUtils.ensureDir ───────────────────────────────────────────────────

    describe('PathUtils.ensureDir', () => {
        it('creates a directory that does not exist', () => {
            const dir = path.join(tmpDir, 'new', 'nested', 'dir');
            PathUtils.ensureDir(dir);
            expect(fs.existsSync(dir)).toBe(true);
        });

        it('does not throw if directory already exists', () => {
            expect(() => PathUtils.ensureDir(tmpDir)).not.toThrow();
        });
    });

    // ── PathUtils.readJsonFile ────────────────────────────────────────────────

    describe('PathUtils.readJsonFile', () => {
        it('reads and parses a valid JSON file', () => {
            const filePath = path.join(tmpDir, 'data.json');
            fs.writeFileSync(filePath, JSON.stringify({ hello: 'world' }), 'utf-8');
            expect(PathUtils.readJsonFile<{ hello: string }>(filePath)).toEqual({ hello: 'world' });
        });

        it('returns undefined for a missing file', () => {
            expect(PathUtils.readJsonFile(path.join(tmpDir, 'missing.json'))).toBeUndefined();
        });

        it('returns undefined for a corrupted JSON file', () => {
            const filePath = path.join(tmpDir, 'bad.json');
            fs.writeFileSync(filePath, '{not valid json', 'utf-8');
            expect(PathUtils.readJsonFile(filePath)).toBeUndefined();
        });
    });

    // ── PathUtils.writeJsonFile ───────────────────────────────────────────────

    describe('PathUtils.writeJsonFile', () => {
        it('writes pretty-printed JSON and creates parent directories', () => {
            const filePath = path.join(tmpDir, 'nested', 'out.json');
            const data = { key: 'value', arr: [1, 2, 3] };
            PathUtils.writeJsonFile(filePath, data);
            const content = fs.readFileSync(filePath, 'utf-8');
            expect(JSON.parse(content)).toEqual(data);
        });

        it('overwrites an existing file', () => {
            const filePath = path.join(tmpDir, 'out.json');
            PathUtils.writeJsonFile(filePath, { v: 1 });
            PathUtils.writeJsonFile(filePath, { v: 2 });
            expect(PathUtils.readJsonFile<{ v: number }>(filePath)).toEqual({ v: 2 });
        });
    });

    // ── PathUtils.getMtime ────────────────────────────────────────────────────

    describe('PathUtils.getMtime', () => {
        it('returns a positive mtime for an existing file', () => {
            const filePath = path.join(tmpDir, 'file.txt');
            fs.writeFileSync(filePath, 'x', 'utf-8');
            expect(PathUtils.getMtime(filePath)).toBeGreaterThan(0);
        });

        it('returns 0 for a missing file', () => {
            expect(PathUtils.getMtime(path.join(tmpDir, 'ghost.txt'))).toBe(0);
        });
    });
});
