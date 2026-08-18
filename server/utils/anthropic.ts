import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const narrationOutputSchema = z.object({
    profile: z.string().min(1),
    why: z.string().min(1),
}).strict();

// Structured outputs via output_config.format — the model is schema-constrained to
// { profile, why }; the response text is still zod-validated before use.
const outputFormat = {
    type: 'json_schema' as const,
    schema: {
        type: 'object',
        properties: {
            profile: { type: 'string', description: 'One warm line naming tonight\'s craving (max ~20 words).' },
            why: { type: 'string', description: 'One short sentence connecting the dish to the craving.' },
        },
        required: ['profile', 'why'],
        additionalProperties: false,
    },
};

// Client abstraction so unit tests inject a fake without any HTTP.
export interface NarrationClient {
    create(args: { model: string; system: string; user: string }): Promise<{
        stopReason: string | null;
        text: string | null;
    }>;
}

let sdkClient: Anthropic | null = null;

export function realNarrationClient(apiKey: string): NarrationClient {
    // SDK default maxRetries is 2 — forced to 0 because the retry policy is ours (§7.4);
    // timeout is in MILLISECONDS in the TS SDK.
    sdkClient ??= new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000 });
    const client = sdkClient;
    return {
        async create(args) {
            const response = await client.messages.create({
                model: args.model,
                max_tokens: 300,
                system: args.system,
                messages: [{ role: 'user', content: args.user }],
                output_config: { format: outputFormat },
            });
            const textBlock = response.content.find((block) => block.type === 'text');
            return {
                stopReason: response.stop_reason,
                text: textBlock?.type === 'text' ? textBlock.text : null,
            };
        },
    };
}

export function isTransient(error: unknown): boolean {
    // Network failures and timeouts (APIConnectionTimeoutError subclasses APIConnectionError).
    if (error instanceof Anthropic.APIConnectionError) return true;
    // 5xx including 529 overloaded. Never 4xx: auth, validation, and 429 all fail fast —
    // narration is decorative (§7.4).
    if (error instanceof Anthropic.APIError) {
        const status = (error as { status?: number }).status;
        return typeof status === 'number' && status >= 500;
    }
    return false;
}

export type NarrationResult = { ok: true; profile: string; why: string } | { ok: false };

export async function narrateWithClaude(options: {
    client: NarrationClient;
    model: string;
    system: string;
    user: string;
}): Promise<NarrationResult> {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await options.client.create({
                model: options.model,
                system: options.system,
                user: options.user,
            });
            // Explicit stop-reason handling (§7.4): refusals are never retried; max_tokens
            // means possibly-truncated JSON — treated as failure, never retried.
            if (response.stopReason === 'refusal') return { ok: false };
            if (response.stopReason === 'max_tokens') return { ok: false };
            if (response.text === null) return { ok: false };
            const parsed = narrationOutputSchema.safeParse(JSON.parse(response.text));
            if (!parsed.success) return { ok: false };
            return { ok: true, ...parsed.data };
        } catch (error) {
            if (attempt === 0 && isTransient(error)) continue;   // exactly one retry, transient only
            return { ok: false };
        }
    }
}
