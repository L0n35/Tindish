import { describe, expect, it } from 'vitest';
import { loadVersioned, saveVersioned, type StorageLike } from '#shared/persistence/migrate';
import {
    activeStoreSchema, historyStoreSchema, metricsStoreSchema, prefsStoreSchema, STORAGE_KEYS,
} from '#shared/persistence/schemas';
import { deck } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { makeConfig, TestSession, baseContext } from '../helpers/session';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => void data.set(k, v),
        removeItem: (k) => void data.delete(k),
    };
}

describe('versioned storage discipline', () => {
    it('round-trips a live envelope through the active store schema', () => {
        const session = new TestSession(baseContext, makeConfig(2));
        session.swipe('like');
        session.swipe('dislike');
        const storage = memoryStorage();
        saveVersioned(storage, STORAGE_KEYS.active, { v: 1, envelope: session.envelope() });
        const loaded = loadVersioned(storage, STORAGE_KEYS.active, activeStoreSchema);
        expect(loaded).not.toBeNull();
        expect(loaded!.envelope.events).toHaveLength(2);
        expect(loaded!.envelope.seed).toBe(2);
    });

    it.each([
        ['malformed JSON', '{{{not json'],
        ['wrong shape', JSON.stringify({ v: 1, envelope: { nope: true } })],
        ['unknown version', JSON.stringify({ v: 99, envelope: {} })],
        ['free-text smuggling (extra key)', JSON.stringify({ v: 1, envelope: {}, note: 'hi' })],
    ])('%s resets cleanly to null and removes the key, never throws', (_label, raw) => {
        const storage = memoryStorage({ [STORAGE_KEYS.active]: raw });
        const loaded = loadVersioned(storage, STORAGE_KEYS.active, activeStoreSchema);
        expect(loaded).toBeNull();
        expect(storage.data.has(STORAGE_KEYS.active)).toBe(false);
    });

    it('a registered migration upgrades old data instead of resetting', () => {
        const storage = memoryStorage({
            [STORAGE_KEYS.prefs]: JSON.stringify({ v: 0, mode: 'cooking' }),
        });
        const loaded = loadVersioned(storage, STORAGE_KEYS.prefs, prefsStoreSchema, {
            0: (old) => ({ ...(old as object), v: 1, effortFilter: 'noLimit' }),
        });
        expect(loaded).toEqual({ v: 1, mode: 'cooking', effortFilter: 'noLimit' });
        expect(JSON.parse(storage.data.get(STORAGE_KEYS.prefs)!)).toEqual(loaded);
    });

    it('a throwing storage backend is swallowed (privacy mode never crashes the app)', () => {
        const broken: StorageLike = {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
            removeItem: () => { throw new Error('denied'); },
        };
        expect(loadVersioned(broken, STORAGE_KEYS.active, activeStoreSchema)).toBeNull();
        expect(() => saveVersioned(broken, STORAGE_KEYS.active, { v: 1 })).not.toThrow();
    });

    it('history, metrics, and prefs schemas accept their canonical shapes', () => {
        const session = new TestSession(baseContext, makeConfig(2));
        session.swipe('like');
        const env = session.envelope();
        const history = {
            v: 1 as const,
            records: [{
                sessionId: env.sessionId, seed: env.seed, engineVersion: env.engineVersion,
                deckHash: env.deckHash, tuningVersion: env.tuningVersion, events: env.events,
                mode: env.mode, effortFilter: env.effortFilter, dealerContext: env.dealerContext,
                startedAt: env.startedAt, shownIds: ['chicken-pad-thai'],
                championId: 'chicken-pad-thai', source: 'bracket' as const, usedRunnerUp: false,
                ts: env.startedAt + 60_000, weather: { line: '12°C and raining' },
            }],
        };
        expect(historyStoreSchema.safeParse(history).success).toBe(true);
        const metrics = {
            v: 1 as const,
            records: [{
                sessionId: 's', seed: 1, dealerMode: 'shuffled' as const, startedAt: 0,
                cardsDealt: 4, positives: 4, superlikes: 0, probesShown: 0, extensionUsed: false,
                endedAt: 9000, endedVia: 'bracket' as const, timeToChampionMs: 9000, eaten: true,
            }],
        };
        expect(metricsStoreSchema.safeParse(metrics).success).toBe(true);
        expect(prefsStoreSchema.safeParse({ v: 1, mode: 'takeaway', effortFilter: 'quick' }).success).toBe(true);
    });
});

describe('tuning', () => {
    it('carries every spec-named constant at its spec default', () => {
        expect(defaultTuning.reactionWeights).toEqual({ like: 1, superlike: 2, probePick: 2, dislike: -1.5 });
        expect(defaultTuning.K).toBe(1);
        expect(defaultTuning.MAX_CARDS).toBe(12);
        expect(defaultTuning.EXTENSION_CARDS).toBe(6);
        expect(defaultTuning.MAX_PROBES).toBe(2);
        expect(defaultTuning.MAX_SESSION_ACTIONS).toBe(24);
        expect(defaultTuning.OMG_CAP).toBe(3);
        expect(defaultTuning.STREAK_THRESHOLD).toBe(7);
        expect(defaultTuning.CHAMPION_24H_PENALTY).toBe(-1.0);
        expect(defaultTuning.DEAL_BLOCK).toEqual(['exploit', 'exploit', 'exploit', 'explore']);
        expect(defaultTuning.DEALER_MODE).toBe('auto');
        expect(defaultTuning.EVENT_LOG_MAX).toBe(64);
        expect(Number.isInteger(defaultTuning.tuningVersion) && defaultTuning.tuningVersion > 0).toBe(true);
    });

    it('the deck stays within the envelope the tuning assumes (a full session cannot exhaust either mode)', () => {
        const perMode = (mode: 'cooking' | 'takeaway') => deck.filter((d) => d.modes.includes(mode)).length;
        const worstCase = defaultTuning.MAX_CARDS + defaultTuning.EXTENSION_CARDS
            + defaultTuning.MAX_PROBES * defaultTuning.PROBE_SIZE;
        expect(perMode('cooking')).toBeGreaterThanOrEqual(30);
        expect(perMode('takeaway')).toBeGreaterThanOrEqual(30);
        expect(Math.min(perMode('cooking'), perMode('takeaway'))).toBeGreaterThanOrEqual(worstCase + 3);
    });
});
