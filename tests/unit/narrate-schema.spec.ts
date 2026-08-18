import { describe, expect, it } from 'vitest';
import { deck } from '#shared/data/deck';
import { narrateRequestSchema } from '#shared/schemas/narrate';

const takeaway = deck.filter((d) => d.modes.includes('takeaway')).map((d) => d.id);

function extensionPayload() {
    // A full 18-card extension session: 17 dislikes + 1 like, champion = the like.
    const reactions = takeaway.slice(0, 18).map((dishId, i) => ({
        dishId,
        reaction: i === 17 ? 'like' as const : 'dislike' as const,
    }));
    return {
        sessionId: 'session-extension',
        mode: 'takeaway' as const,
        source: 'direct' as const,
        championId: takeaway[17]!,
        reactions,
    };
}

describe('narrate request schema (§7 invariants)', () => {
    it('accepts a valid 18-reaction extension payload', () => {
        expect(narrateRequestSchema.safeParse(extensionPayload()).success).toBe(true);
    });

    it('accepts a bracket payload with a positive runner-up', () => {
        const payload = {
            sessionId: 's1',
            mode: 'cooking',
            source: 'bracket',
            championId: 'chicken-pad-thai',
            runnerUpId: 'beef-pho',
            reactions: [
                { dishId: 'chicken-pad-thai', reaction: 'superlike' },
                { dishId: 'beef-pho', reaction: 'like' },
                { dishId: 'margherita-pizza', reaction: 'dislike' },
            ],
        };
        expect(narrateRequestSchema.safeParse(payload).success).toBe(true);
    });

    it.each([
        ['unknown dishId', (p: ReturnType<typeof extensionPayload>) => {
            p.reactions[0]!.dishId = 'dish-that-does-not-exist';
        }],
        ['duplicate dishId', (p: ReturnType<typeof extensionPayload>) => {
            p.reactions[1]!.dishId = p.reactions[0]!.dishId;
        }],
        ['champion without positive reaction', (p: ReturnType<typeof extensionPayload>) => {
            p.reactions[17]!.reaction = 'dislike' as never;
        }],
        ['champion absent from reactions', (p: ReturnType<typeof extensionPayload>) => {
            p.championId = takeaway[20]!;
        }],
        ['unknown champion', (p: ReturnType<typeof extensionPayload>) => {
            p.championId = 'nope-not-real';
        }],
    ])('rejects %s', (_label, mutate) => {
        const payload = extensionPayload();
        mutate(payload);
        expect(narrateRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects an oversized reactions array (25 > MAX_SESSION_ACTIONS)', () => {
        const payload = extensionPayload();
        payload.reactions = takeaway.slice(0, 25).map((dishId, i) => ({
            dishId, reaction: i === 0 ? 'like' as const : 'dislike' as const,
        }));
        payload.championId = takeaway[0]!;
        expect(narrateRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects an empty reactions array', () => {
        const payload = { ...extensionPayload(), reactions: [] };
        expect(narrateRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects runnerUpId equal to champion, non-positive, or unknown', () => {
        const base = extensionPayload();
        expect(narrateRequestSchema.safeParse({ ...base, runnerUpId: base.championId }).success).toBe(false);
        expect(narrateRequestSchema.safeParse({ ...base, runnerUpId: base.reactions[0]!.dishId }).success).toBe(false);
        expect(narrateRequestSchema.safeParse({ ...base, runnerUpId: 'not-a-dish' }).success).toBe(false);
    });

    it('rejects free text anywhere: extra top-level keys and extra reaction keys (.strict everywhere)', () => {
        const withNote = { ...extensionPayload(), note: 'please be extra nice tonight' };
        expect(narrateRequestSchema.safeParse(withNote).success).toBe(false);
        const payload = extensionPayload();
        (payload.reactions[0] as Record<string, unknown>).comment = 'loved it';
        expect(narrateRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects history as a source — history champions never call the API', () => {
        expect(narrateRequestSchema.safeParse({ ...extensionPayload(), source: 'history' }).success).toBe(false);
    });

    it('rejects non-enum reactions (no free-text reaction smuggling)', () => {
        const payload = extensionPayload();
        (payload.reactions[0] as Record<string, unknown>).reaction = 'adored it so much';
        expect(narrateRequestSchema.safeParse(payload).success).toBe(false);
    });
});
