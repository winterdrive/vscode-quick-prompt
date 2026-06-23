import * as fs from 'fs'
import * as path from 'path'

interface MockWorkspaceFolder {
    uri: Uri
    name: string
}

export const workspace: {
    getConfiguration: (_section?: string) => { get: <T>(_key: string, defaultValue: T) => T }
    workspaceFolders: undefined | MockWorkspaceFolder[]
    activeTextEditor: undefined | { document: { uri: Uri } }
    getWorkspaceFolder: jest.Mock<MockWorkspaceFolder | undefined, [Uri]>
    onDidChangeConfiguration: (_listener: unknown) => { dispose: () => undefined }
    onDidChangeWorkspaceFolders: (_listener: unknown) => { dispose: () => undefined }
    createFileSystemWatcher: jest.Mock
    fs: {
        readFile: (uri: Uri) => Promise<Uint8Array>
        writeFile: (uri: Uri, content: Uint8Array) => Promise<void>
        createDirectory: (uri: Uri) => Promise<void>
        delete: (uri: Uri) => Promise<void>
    }
} = {
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
    }),
    workspaceFolders: undefined,
    activeTextEditor: undefined as undefined | { document: { uri: Uri } },
    getWorkspaceFolder: jest.fn((uri: Uri): MockWorkspaceFolder | undefined =>
        workspace.workspaceFolders?.find(folder => uri.fsPath.startsWith(folder.uri.fsPath))
    ),
    onDidChangeConfiguration: (_listener: unknown) => ({ dispose: () => undefined }),
    onDidChangeWorkspaceFolders: (_listener: unknown) => ({ dispose: () => undefined }),
    createFileSystemWatcher: jest.fn(() => ({
        onDidChange: jest.fn(),
        onDidCreate: jest.fn(),
        onDidDelete: jest.fn(),
        dispose: jest.fn(),
    })),
    fs: {
        readFile: async (uri: Uri): Promise<Uint8Array> => {
            try {
                return await fs.promises.readFile(uri.fsPath)
            } catch (error: any) {
                if (error?.code === 'ENOENT') {
                    error.code = 'FileNotFound'
                }
                throw error
            }
        },
        writeFile: async (uri: Uri, content: Uint8Array): Promise<void> => {
            await fs.promises.mkdir(path.dirname(uri.fsPath), { recursive: true })
            await fs.promises.writeFile(uri.fsPath, content)
        },
        createDirectory: async (uri: Uri): Promise<void> => {
            await fs.promises.mkdir(uri.fsPath, { recursive: true })
        },
        delete: async (uri: Uri): Promise<void> => {
            try {
                await fs.promises.rm(uri.fsPath, { recursive: true, force: false })
            } catch (error: any) {
                if (error?.code === 'ENOENT') {
                    error.code = 'FileNotFound'
                }
                throw error
            }
        },
    },
}

export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
} as const

export class TreeItem {
    contextValue?: string
    description?: string
    iconPath?: unknown
    tooltip?: string
    command?: unknown

    constructor(
        public readonly label: string,
        public readonly collapsibleState?: number,
    ) {}
}

export class ThemeIcon {
    constructor(
        public readonly id: string,
        public readonly color?: ThemeColor,
    ) {}
}

export class ThemeColor {
    constructor(public readonly id: string) {}
}

export class EventEmitter<T = unknown> {
    event = (_listener: (e: T) => unknown): { dispose: () => void } => ({ dispose: () => undefined })
    fire(_event?: T): void {}
    dispose(): void {}
}

export class Uri {
    static file(path: string): Uri {
        return new Uri('file', '', path, '', '')
    }
    static parse(value: string): Uri {
        const match = value.match(/^([^:]+):(.+)$/)
        if (!match) {
            return new Uri('', '', value, '', '')
        }
        return new Uri(match[1], '', match[2], '', '')
    }
    static joinPath(base: Uri, ...segments: string[]): Uri {
        return Uri.file(path.join(base.fsPath, ...segments))
    }
    constructor(
        public readonly scheme: string,
        public readonly authority: string,
        public readonly path: string,
        public readonly query: string,
        public readonly fragment: string,
    ) {}
    get fsPath(): string { return this.path }
    toString(): string { return `${this.scheme}://${this.path}` }
}

export class RelativePattern {
    constructor(
        public readonly base: Uri,
        public readonly pattern: string,
    ) {}
}

export class ExtensionContext {
    subscriptions: { dispose(): unknown }[] = []
    workspaceState = {
        get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
        update: (_key: string, _value: unknown): Thenable<void> => Promise.resolve(),
        keys: (): readonly string[] => [],
    }
    globalState = {
        get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
        update: (_key: string, _value: unknown): Thenable<void> => Promise.resolve(),
        keys: (): readonly string[] => [],
        setKeysForSync: (_keys: readonly string[]): void => {},
    }
    secrets = {
        get: (_key: string): Thenable<string | undefined> => Promise.resolve(undefined),
        store: (_key: string, _value: string): Thenable<void> => Promise.resolve(),
        delete: (_key: string): Thenable<void> => Promise.resolve(),
    }
    extensionUri = Uri.file('')
    extensionPath = ''
    storagePath = ''
    globalStoragePath = ''
    logPath = ''
    asAbsolutePath = (relativePath: string): string => relativePath
}

export const window = {
    activeTextEditor: undefined as undefined | { document: { uri: Uri } },
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    setStatusBarMessage: jest.fn(),
    onDidChangeWindowState: jest.fn(() => ({ dispose: () => undefined })),
    onDidChangeTextEditorSelection: jest.fn(() => ({ dispose: () => undefined })),
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        append: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn(),
    })),
    createTreeView: jest.fn(() => ({
        reveal: jest.fn(),
        dispose: jest.fn(),
        onDidChangeVisibility: jest.fn(),
        onDidChangeSelection: jest.fn(),
        onDidExpandElement: jest.fn(),
        onDidCollapseElement: jest.fn(),
        visible: false,
        selection: [],
    })),
}

export const FileSystemError = {
    FileNotFound: (uri: Uri) => Object.assign(new Error(`File not found: ${uri.toString()}`), { code: 'FileNotFound' }),
    NoPermissions: (message: string) => Object.assign(new Error(message), { code: 'NoPermissions' }),
}

export const commands = {
    registerCommand: jest.fn(() => ({ dispose: () => undefined })),
    executeCommand: jest.fn(),
}

export const env = {
    clipboard: {
        readText: jest.fn(() => Promise.resolve('')),
        writeText: jest.fn(() => Promise.resolve()),
    },
    language: 'en',
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}
