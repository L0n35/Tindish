import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { isTransient, narrateWithClaude, type NarrationClient } from '../../server/utils/anthropic';

function fakeClient(script: (() => Promise<{ stopReason: string | null; text: string | null }>)[]): NarrationClient & { calls: number } {
    let call = 0;
    return {
        get calls() { return call; },
        create() {
            const step = script[Math.min(call, script.length - 1)]!;
            call++;
            return step();
        },
    };
}

const good = () => Promise.resolve({ stopReason: 'end_turn', text: JSON.stringify({ profile: 'Comfort night', why: 'It fits.' }) });
const apiError = (status: number) => () => Promise.reject(new Anthropic.APIError(status, { error: { message: 'x' } }, 'x', new Headers()));
const connectionError = () => Promise.reject(new Anthropic.APIConnectionError({ message: 'socket hang up' }));

const run = (client: NarrationClient) =>
    narrateWithClaude({ client, model: 'claude-sonnet-4-6', system: 's', user: 'u' });

describe('narrateWithClaude retry policy (§7.4: one retry, transient only)', () => {
    it('500 then success → 2 calls, ok', async () => {
        const client = fakeClient([apiError(500), good]);
        expect(await run(client)).toEqual({ ok: true, profile: 'Comfort night', why: 'It fits.' });
        expect(client.calls).toBe(2);
    });

    it('500 then 500 → 2 calls, fallback (never a third)', async () => {
        const client = fakeClient([apiError(500), apiError(500)]);
        expect(await run(client)).toEqual({ ok: false });
        expect(client.calls).toBe(2);
    });

    it('network error then success → retried once', async () => {
        const client = fakeClient([connectionError, good]);
        expect(await run(client)).toEqual({ ok: true, profile: 'Comfort night', why: 'It fits.' });
        expect(client.calls).toBe(2);
    });

    it('529 overloaded counts as transient', async () => {
        const client = fakeClient([apiError(529), good]);
        expect((await run(client)).ok).toBe(true);
        expect(client.calls).toBe(2);
    });

    it.each([
        ['401 auth failure', apiError(401)],
        ['400 validation failure', apiError(400)],
        ['429 rate limit (decorative — fail fast)', apiError(429)],
    ])('%s → 1 call, fallback, never retried', async (_label, thrower) => {
        const client = fakeClient([thrower, good]);
        expect(await run(client)).toEqual({ ok: false });
        expect(client.calls).toBe(1);
    });

    it.each([
        ['refusal', 'refusal'],
        ['max_tokens', 'max_tokens'],
    ])('stop_reason %s → explicit fallback, no retry', async (_label, stopReason) => {
        const client = fakeClient([() => Promise.resolve({ stopReason, text: '{"profile":"x","why":"y"}' })]);
        expect(await run(client)).toEqual({ ok: false });
        expect(client.calls).toBe(1);
    });

    it('schema-parse miss (wrong shape / invalid JSON) → fallback, no retry', async () => {
        const wrongShape = fakeClient([() => Promise.resolve({ stopReason: 'end_turn', text: '{"poem":"nope"}' })]);
        expect(await run(wrongShape)).toEqual({ ok: false });
        expect(wrongShape.calls).toBe(1);
        const invalidJson = fakeClient([() => Promise.resolve({ stopReason: 'end_turn', text: 'not json at all' })]);
        expect(await run(invalidJson)).toEqual({ ok: false });
        expect(invalidJson.calls).toBe(1);
    });

    it('extra keys in the model output are rejected by the strict output schema', async () => {
        const client = fakeClient([() => Promise.resolve({
            stopReason: 'end_turn',
            text: JSON.stringify({ profile: 'x', why: 'y', suggestion: 'try pizza instead' }),
        })]);
        expect(await run(client)).toEqual({ ok: false });
    });
});

describe('isTransient', () => {
    it('classifies connection errors and 5xx as transient; 4xx and unknown errors as not', () => {
        expect(isTransient(new Anthropic.APIConnectionError({ message: 'x' }))).toBe(true);
        expect(isTransient(new Anthropic.APIError(500, undefined, 'x', new Headers()))).toBe(true);
        expect(isTransient(new Anthropic.APIError(429, undefined, 'x', new Headers()))).toBe(false);
        expect(isTransient(new Anthropic.APIError(401, undefined, 'x', new Headers()))).toBe(false);
        expect(isTransient(new SyntaxError('bad json'))).toBe(false);
    });
});
