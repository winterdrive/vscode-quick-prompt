import { AIEngine } from '../../ai/aiEngine';

/**
 * Regression coverage for PR #77: "fail fast on worker summarize error
 * instead of waiting for the 90s timeout".
 *
 * Before the fix, a worker-side error never carried the specific
 * `requestId`, so `handleWorkerMessage()` could only flip the global
 * `status` flag — it had no way to reject the one pending promise that
 * actually failed. The caller of `summarizeViaWorker()` was left waiting
 * for its own 90-second `setTimeout` fallback.
 *
 * These tests drive `AIEngine`'s private worker-message handling directly
 * (via `as any`) with synthetic messages, instead of spawning a real
 * `worker_threads` Worker — that would be slow/flaky and isn't needed since
 * the fix lives entirely in how `AIEngine` interprets messages it receives.
 */
describe('AIEngine worker error handling (PR #77 fail-fast fix)', () => {
    let engine: AIEngine;
    let postMessage: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        engine = AIEngine.getInstance();
        // Reset internal state between tests; AIEngine is a singleton.
        postMessage = jest.fn();
        (engine as any).worker = { postMessage };
        (engine as any).pendingRequests = new Map();
        (engine as any).status = 'ready';
    });

    afterEach(() => {
        (engine as any).pendingRequests = new Map();
        (engine as any).worker = null;
        (engine as any).status = 'uninitialized';
        jest.useRealTimers();
    });

    function startRequest(text = 'some text to summarize'): { promise: Promise<string>; requestId: number } {
        // Track the call count before invoking rather than asserting a fixed
        // total, since some tests start more than one concurrent request.
        const callsBefore = postMessage.mock.calls.length;
        const promise: Promise<string> = (engine as any).summarizeViaWorker(text, 50);
        expect(postMessage).toHaveBeenCalledTimes(callsBefore + 1);
        const requestId = postMessage.mock.calls[callsBefore][0].requestId;
        expect(typeof requestId).toBe('number');
        return { promise, requestId };
    }

    it('rejects the specific pending request immediately on a matching error message, without waiting for the 90s timeout', async () => {
        const { promise, requestId } = startRequest();

        let settled = false;
        promise.then(() => { settled = true; });

        // No time is advanced here at all — proving settlement does not
        // depend on the 90s (or any) timeout firing.
        (engine as any).handleWorkerMessage({ type: 'error', requestId, error: 'worker exploded' });

        await Promise.resolve();
        await Promise.resolve();

        expect(settled).toBe(true);
        // The 90s timeout for this request must have been cleared, not left
        // pending — otherwise it would double-resolve later.
        expect(jest.getTimerCount()).toBe(0);
        expect((engine as any).pendingRequests.has(requestId)).toBe(false);
    });

    it('does not affect other concurrently pending requests when one is rejected', async () => {
        const { promise: promiseA, requestId: idA } = startRequest('text A');
        const { promise: promiseB, requestId: idB } = startRequest('text B');

        expect(idA).not.toBe(idB);

        let settledA = false;
        let settledB = false;
        promiseA.then(() => { settledA = true; });
        promiseB.then(() => { settledB = true; });

        (engine as any).handleWorkerMessage({ type: 'error', requestId: idA, error: 'boom' });
        await Promise.resolve();
        await Promise.resolve();

        expect(settledA).toBe(true);
        expect(settledB).toBe(false);
        expect((engine as any).pendingRequests.has(idA)).toBe(false);
        expect((engine as any).pendingRequests.has(idB)).toBe(true);
        // Request B's own 90s timeout is still armed as its fallback safety net.
        expect(jest.getTimerCount()).toBe(1);

        // Clean up B so it doesn't leak a real pending timer into other tests.
        (engine as any).handleWorkerMessage({ type: 'result', requestId: idB, title: 'B done' });
        await expect(promiseB).resolves.toBe('B done');
    });

    it('still resolves the correct pending request normally on a genuine result message (no regression)', async () => {
        const { promise, requestId } = startRequest();

        (engine as any).handleWorkerMessage({ type: 'result', requestId, title: 'Generated Title' });

        await expect(promise).resolves.toBe('Generated Title');
        expect((engine as any).pendingRequests.has(requestId)).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('falls back to the pre-fix behavior (global status flip, no fast rejection) when a message carries no requestId', async () => {
        // This reproduces exactly what the OLD aiWorker.ts sent on error
        // (no requestId at all) and demonstrates why that was a bug: the
        // pending request is left untouched, so the caller can only be
        // rescued by its own 90s timeout.
        const { promise, requestId } = startRequest();

        let settled = false;
        promise.then(() => { settled = true; });

        (engine as any).handleWorkerMessage({ type: 'error', error: 'boom, no requestId' });
        await Promise.resolve();
        await Promise.resolve();

        expect(settled).toBe(false);
        expect((engine as any).pendingRequests.has(requestId)).toBe(true);
        expect((engine as any).status).toBe('error');

        // It only settles once the 90s fallback timer actually fires.
        jest.advanceTimersByTime(90000);
        await Promise.resolve();
        expect(settled).toBe(true);
    });
});
