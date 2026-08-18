import { describe, expect, it, vi } from 'vitest';

// The retry suite injects a fake client, so the REAL client's call shape needs its own
// assertion (§16.9 "token cap, timeout verified"): max_tokens 300, structured outputs,
// SDK timeout 10s in MILLISECONDS with the SDK's own retries disabled (the app owns the
// single transient retry).
const captured: { ctorOptions?: Record<string, unknown>; createArgs?: Record<string, unknown> } = {};

vi.mock('@anthropic-ai/sdk', () => {
    class MockAnthropic {
        messages = {
            create: (args: Record<string, unknown>) => {
                captured.createArgs = args;
                return Promise.resolve({
                    stop_reason: 'end_turn',
                    content: [{ type: 'text', text: '{"profile":"p","why":"w"}' }],
                });
            },
        };

        constructor(options: Record<string, unknown>) {
            captured.ctorOptions = options;
        }

        static APIError = class extends Error {};
        static APIConnectionError = class extends Error {};
    }
    return { default: MockAnthropic };
});

describe('realNarrationClient call shape', () => {
    it('constructs the SDK with timeout 10_000ms and maxRetries 0, and calls with max_tokens 300 + structured outputs', async () => {
        const { realNarrationClient } = await import('../../server/utils/anthropic');
        const client = realNarrationClient('test-key');
        const result = await client.create({ model: 'claude-sonnet-4-6', system: 'sys', user: 'usr' });

        expect(captured.ctorOptions).toMatchObject({ apiKey: 'test-key', maxRetries: 0, timeout: 10_000 });
        expect(captured.createArgs).toMatchObject({
            model: 'claude-sonnet-4-6',
            max_tokens: 300,
            system: 'sys',
        });
        const outputConfig = captured.createArgs!.output_config as { format: { type: string; schema: { required: string[] } } };
        expect(outputConfig.format.type).toBe('json_schema');
        expect(outputConfig.format.schema.required).toEqual(['profile', 'why']);
        expect(result).toEqual({ stopReason: 'end_turn', text: '{"profile":"p","why":"w"}' });
    });
});
