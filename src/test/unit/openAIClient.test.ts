import * as vscode from 'vscode';
import { OpenAICompatibleClient } from '../../ai/openAIClient';

describe('OpenAICompatibleClient.chat timeout', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: <T>(key: string, defaultValue: T): T => (key === 'timeout' ? (50 as unknown as T) : defaultValue),
        } as any);
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    // Simulates a server that sends headers but then stalls the body until aborted.
    function mockStalledBodyFetch(): void {
        global.fetch = jest.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
            const signal = init?.signal;
            const stalled = () => new Promise<never>((_resolve, reject) => {
                signal?.addEventListener('abort', () => {
                    const err = new Error('aborted');
                    err.name = 'AbortError';
                    reject(err);
                });
            });
            return Promise.resolve({ ok: true, status: 200, json: stalled, text: stalled });
        }) as any;
    }

    it('aborts a response whose body stalls after headers arrive', async () => {
        mockStalledBodyFetch();
        const client = new OpenAICompatibleClient();

        await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('Request timed out after 50ms');
    });

    it('returns content and clears the timer on success', async () => {
        const clearSpy = jest.spyOn(global, 'clearTimeout');
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ choices: [{ message: { content: ' ok ' } }] }),
        })) as any;
        const client = new OpenAICompatibleClient();

        await expect(client.chat([{ role: 'user', content: 'hi' }])).resolves.toBe('ok');
        expect(clearSpy).toHaveBeenCalled();
    });
});
