/**
 * Path utilities — pure Node.js, no vscode dependency.
 * Provides workspace boundary enforcement and path normalization.
 */

import * as path from 'path';
import * as fs from 'fs';

export class PathUtils {
    constructor(private workspaceRoot: string) {}

    /**
     * Validate that a path is within the workspace boundary.
     */
    validatePath(filePath: string): boolean {
        const resolved = this.toAbsolutePath(filePath);
        const normalizedRoot = path.resolve(this.workspaceRoot);
        const normalizedPath = path.resolve(resolved);
        return normalizedPath === normalizedRoot || normalizedPath.startsWith(normalizedRoot + path.sep);
    }

    /**
     * Convert a relative path to an absolute path within the workspace.
     */
    toAbsolutePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return path.resolve(filePath);
        }
        return path.resolve(this.workspaceRoot, filePath);
    }

    /**
     * Convert an absolute path to a workspace-relative path.
     */
    toRelativePath(absolutePath: string): string {
        return path.relative(this.workspaceRoot, absolutePath);
    }

    /**
     * Ensure a directory exists (creates it recursively if needed).
     */
    static ensureDir(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Safely read a JSON file. Returns undefined if not found.
     */
    static readJsonFile<T>(filePath: string): T | undefined {
        try {
            if (!fs.existsSync(filePath)) {
                return undefined;
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content) as T;
        } catch {
            return undefined;
        }
    }

    /**
     * Safely write a JSON file with pretty-printing.
     */
    static writeJsonFile(filePath: string, data: unknown): void {
        const dir = path.dirname(filePath);
        PathUtils.ensureDir(dir);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * Get the file modification time (for optimistic locking).
     */
    static getMtime(filePath: string): number {
        try {
            const stat = fs.statSync(filePath);
            return stat.mtimeMs;
        } catch {
            return 0;
        }
    }
}
