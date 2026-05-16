export const workspace = {
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
    }),
    workspaceFolders: undefined as undefined,
    onDidChangeConfiguration: (_listener: unknown) => ({ dispose: () => undefined }),
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
        return new Uri('', '', value, '', '')
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
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
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
