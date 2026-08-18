import { describe, expect, it, vi } from 'vitest';
import { NarrationController, type NarrationLine } from '../../app/utils/narrationController';
import type { NarrateRequest, NarrateResponse } from '#shared/schemas/narrate';

function makeRequest(sessionId = 's1'): NarrateRequest {
    return {
        sessionId,
        mode: 'takeaway',
        source: 'bracket',
        championId: 'chicken-pad-thai',
        runnerUpId: 'beef-pho',
        reactions: [
            { dishId: 'chicken-pad-thai', reaction: 'like' },
            { dishId: 'beef-pho', reaction: 'like' },
        ],
    };
}

interface PendingCall {
    resolve: (res: NarrateResponse) => void;
    reject: (err: unknown) => void;
    signal: AbortSignal;
}

function harness() {
    const lines: NarrationLine[] = [];
    const patches: [string, string][] = [];
    const calls: PendingCall[] = [];
    const controller = new NarrationController({
        post: (_body, signal) =>
            new Promise<NarrateResponse>((resolve, reject) => {
                calls.push({ resolve, reject, signal });
            }),
        patchHistoryWeather: (id, line) => patches.push([id, line]),
        onLine: (line) => lines.push(line),
    });
    return {
        controller,
        lines,
        patches,
        calls,
        resolve: (res: NarrateResponse) => calls.at(-1)!.resolve(res),
        reject: (err: unknown) => calls.at(-1)!.reject(err),
        aborted: () => calls.at(-1)?.signal.aborted ?? false,
        get postCalls() { return calls.length; },
    };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('NarrationController races (§6.4)', () => {
    it('emits the template immediately and crossfades to the AI line on success', async () => {
        const h = harness();
        h.controller.start(makeRequest(), 'Comfort won the night.');
        expect(h.lines).toEqual([{ kind: 'template', text: 'Comfort won the night.' }]);
        h.resolve({ profile: 'A comfort craving', why: 'Warm and rich fits tonight.', contextEcho: { timeOfDay: 'evening' } });
        await flush();
        expect(h.lines[1]).toEqual({ kind: 'ai', profile: 'A comfort craving', why: 'Warm and rich fits tonight.' });
    });

    it('fallback:true keeps the template but stashes the weather echo for save time', async () => {
        const h = harness();
        h.controller.start(makeRequest(), 'Template line.');
        h.resolve({ fallback: true, contextEcho: { weatherLine: '12°C and raining', timeOfDay: 'evening' } });
        await flush();
        expect(h.lines).toHaveLength(1);
        expect(h.controller.weatherLineForSave()).toBe('12°C and raining');
    });

    it('save-then-patch: Sorted before the response saves now; the late echo patches by session id and never touches the UI', async () => {
        const h = harness();
        h.controller.start(makeRequest('session-42'), 'Template line.');
        h.controller.sorted();
        h.resolve({ profile: 'X', why: 'Y', contextEcho: { weatherLine: '3°C and snowing', timeOfDay: 'night' } });
        await flush();
        expect(h.lines).toHaveLength(1);   // no AI crossfade after Sorted
        expect(h.patches).toEqual([['session-42', '3°C and snowing']]);
    });

    it('echo arrived before Sorted → weather is available at save time, no patch needed', async () => {
        const h = harness();
        h.controller.start(makeRequest('session-9'), 'Template line.');
        h.resolve({ fallback: true, contextEcho: { weatherLine: '30°C and clear', timeOfDay: 'evening' } });
        await flush();
        h.controller.sorted();
        expect(h.controller.weatherLineForSave()).toBe('30°C and clear');
        expect(h.patches).toHaveLength(0);
    });

    it('runner-up promotion aborts in-flight, regenerates the template, and re-requests exactly once', async () => {
        const h = harness();
        h.controller.start(makeRequest(), 'First template.');
        expect(h.postCalls).toBe(1);
        h.controller.promoteRunnerUp(makeRequest(), 'Promoted template.');
        expect(h.aborted()).toBe(false); // new request's signal
        expect(h.postCalls).toBe(2);
        expect(h.lines.at(-1)).toEqual({ kind: 'template', text: 'Promoted template.' });
        // A second promotion can never re-request again.
        h.controller.promoteRunnerUp(makeRequest(), 'Third template.');
        expect(h.postCalls).toBe(2);
        expect(h.lines.at(-1)).toEqual({ kind: 'template', text: 'Third template.' });
    });

    it('a stale response (superseded attempt) is ignored entirely', async () => {
        const h = harness();
        h.controller.start(makeRequest(), 'First template.');
        h.controller.promoteRunnerUp(makeRequest(), 'Promoted template.');
        expect(h.calls[0]!.signal.aborted).toBe(true);   // in-flight request aborted
        // Even if the first request somehow still resolved, its attempt token is stale.
        h.calls[0]!.resolve({ profile: 'STALE', why: 'STALE', contextEcho: { timeOfDay: 'evening' } });
        await flush();
        expect(h.lines.some((l) => l.kind === 'ai' && l.profile === 'STALE')).toBe(false);
        // The live (second) request still lands normally.
        h.calls[1]!.resolve({ profile: 'FRESH', why: 'W', contextEcho: { timeOfDay: 'evening' } });
        await flush();
        expect(h.lines.at(-1)).toEqual({ kind: 'ai', profile: 'FRESH', why: 'W' });
    });

    it('dispose aborts and suppresses everything, including patches', async () => {
        const h = harness();
        h.controller.start(makeRequest('session-1'), 'Template.');
        h.controller.sorted();
        h.controller.dispose();
        expect(h.aborted()).toBe(true);
        h.resolve({ profile: 'X', why: 'Y', contextEcho: { weatherLine: 'w', timeOfDay: 'evening' } });
        await flush();
        expect(h.patches).toHaveLength(0);
        expect(h.lines).toHaveLength(1);
    });

    it('a rejected request leaves the template standing (no client retry)', async () => {
        const h = harness();
        h.controller.start(makeRequest(), 'Template stands.');
        h.reject(new Error('500'));
        await flush();
        expect(h.lines).toEqual([{ kind: 'template', text: 'Template stands.' }]);
        expect(h.postCalls).toBe(1);
    });
});
