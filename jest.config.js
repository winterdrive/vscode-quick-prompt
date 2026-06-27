/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/src/test/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/src/test/ui/', '/.vscode-test/'],
    modulePathIgnorePatterns: ['<rootDir>/.vscode-test/', '<rootDir>/dist/'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    },
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    collectCoverageFrom: [
        'src/core/PromptManager.ts',
        'src/core/PathUtils.ts',
        'src/core/VersionManager.ts',
    ],
    coverageThreshold: {
        global: {
            statements: 80,
            branches: 70,
            functions: 80,
            lines: 80,
        },
    },
};
