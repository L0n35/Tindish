// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../../app/composables/useSessionStore';
import { appStorage } from '../../../app/utils/storage';
import { STORAGE_KEYS, activeStoreSchema, historyStoreSchema, metricsStoreSchema } from '#shared/persistence/schemas';
import { loadVersioned, saveVersioned } from '#shared/persistence/migrate';
import { defaultTuning } from '#shared/tuning';
import { ENGINE_VERSION } from '#shared/engine/version';
import { hashDeck } from '#shared/data/deckHash';
import { deck } from '#shared/data/deck';
import type { SessionEnvelope } from '#shared/types/session';

const storage = appStorage();

function clearAll(): void {
    for (const key of Object.values(STORAGE_KEYS)) storage.removeItem(key);
}

function storedEnvelope(): SessionEnvelope {
    return loadVersioned(storage, STORAGE_KEYS.active, activeStoreSchema)!.envelope;
}

function makeStoredEnvelope(overrides: Partial<SessionEnvelope> = {}): SessionEnvelope {
    return {
        v: 1,
        sessionId: 'stored-session',
        seed: 2,
        engineVersion: ENGINE_VERSION,
        deckHash: hashDeck(deck),
        tuningVersion: defaultTuning.tuningVersion,
        mode: 'takeaway',
        dealerContext: { recentChampions: [], lastSessionShownIds: [], historyChampionIds: [] },
        startedAt: Date.now(),
        events: [],
        ...overrides,
    };
}

describe('useSessionStore driver (shell machine + persistence wiring)', () => {
    beforeEach(() => {
        clearAll();
        useSessionStore().leaveToHome();
    });

    it('startNew persists the envelope and an open metrics record before the first swipe', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        expect(store.shell.value).toBe('active');
        const env = storedEnvelope();
        expect(env.events).toHaveLength(0);
        const metrics = loadVersioned(storage, STORAGE_KEYS.metrics, metricsStoreSchema)!;
        expect(metrics.records[0]!.sessionId).toBe(env.sessionId);
        expect(metrics.records[0]!.endedAt).toBeUndefined();
        expect(metrics.records[0]!.dealerMode).toBe('adaptive'); // even seed
    });

    it('write-through: every dispatch persists; leaveToHome + restoreActive re-folds to the same state', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        store.dispatch({ type: 'swipe', dishId: store.state.value!.currentCard!, reaction: 'like' });
        store.dispatch({ type: 'swipe', dishId: store.state.value!.currentCard!, reaction: 'dislike' });
        const snapshot = { ...store.state.value!, undo: null };
        store.leaveToHome();
        expect(store.restoreActive()).toBe(true);
        expect({ ...store.state.value!, undo: null }).toEqual(snapshot);
    });

    it('probe atomicity: the triggering dislike and probeShown land as one persisted unit', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        for (let i = 0; i < 7; i++) {
            store.dispatch({ type: 'swipe', dishId: store.state.value!.currentCard!, reaction: 'dislike' });
        }
        expect(store.state.value!.phase).toBe('probe');
        expect(store.state.value!.probe!.dishIds).not.toBeNull();     // committed, never dangling
        const env = storedEnvelope();
        expect(env.events.at(-1)!.type).toBe('probeShown');           // persisted together
        store.leaveToHome();
        expect(store.restoreActive()).toBe(true);
        expect(store.state.value!.probe!.dishIds).toEqual(env.events.at(-1)!.type === 'probeShown'
            ? (env.events.at(-1) as { dishIds: string[] }).dishIds
            : null);
    });

    it('a stale active session (> ACTIVE_SESSION_MAX_AGE_MS) is discarded and its metrics marked abandoned', () => {
        const env = makeStoredEnvelope({ startedAt: Date.now() - defaultTuning.ACTIVE_SESSION_MAX_AGE_MS - 60_000 });
        saveVersioned(storage, STORAGE_KEYS.active, { v: 1, envelope: env });
        saveVersioned(storage, STORAGE_KEYS.metrics, {
            v: 1,
            records: [{
                sessionId: env.sessionId, seed: env.seed, dealerMode: 'adaptive', startedAt: env.startedAt,
                cardsDealt: 1, positives: 0, superlikes: 0, probesShown: 0, extensionUsed: false,
            }],
        });
        const store = useSessionStore();
        expect(store.restoreActive()).toBe(false);
        expect(store.shell.value).toBe('home');
        expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();
        const metrics = loadVersioned(storage, STORAGE_KEYS.metrics, metricsStoreSchema)!;
        expect(metrics.records[0]!.endedVia).toBe('abandoned');
    });

    it('launchSweep (home//debug mount) discards a stale envelope and closes orphans without entering a session', () => {
        const env = makeStoredEnvelope({ startedAt: Date.now() - defaultTuning.ACTIVE_SESSION_MAX_AGE_MS - 1 });
        saveVersioned(storage, STORAGE_KEYS.active, { v: 1, envelope: env });
        saveVersioned(storage, STORAGE_KEYS.metrics, {
            v: 1,
            records: [{
                sessionId: env.sessionId, seed: env.seed, dealerMode: 'adaptive', startedAt: env.startedAt,
                cardsDealt: 5, positives: 1, superlikes: 0, probesShown: 0, extensionUsed: false,
            }],
        });
        const store = useSessionStore();
        store.launchSweep();
        expect(store.shell.value).toBe('home');   // never enters a session
        expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();
        const metrics = loadVersioned(storage, STORAGE_KEYS.metrics, metricsStoreSchema)!;
        expect(metrics.records[0]!.endedVia).toBe('abandoned');
    });

    it('launchSweep leaves a fresh restorable session and its open metrics record alone', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        const sessionId = store.sessionId.value!;
        store.leaveToHome();
        store.launchSweep();
        expect(storage.getItem(STORAGE_KEYS.active)).not.toBeNull();
        const metrics = loadVersioned(storage, STORAGE_KEYS.metrics, metricsStoreSchema)!;
        expect(metrics.records.find((r) => r.sessionId === sessionId)!.endedVia).toBeUndefined();
        expect(store.restoreActive()).toBe(true);
    });

    it('a version-mismatched active session is discarded safely (never mis-restored)', () => {
        saveVersioned(storage, STORAGE_KEYS.active, { v: 1, envelope: makeStoredEnvelope({ engineVersion: 999 }) });
        const store = useSessionStore();
        expect(store.restoreActive()).toBe(false);
        expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();
    });

    it('the launch sweep marks orphaned open metrics records abandoned, sparing the restorable session', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        const liveSessionId = storedEnvelope().sessionId;
        const metrics = loadVersioned(storage, STORAGE_KEYS.metrics, metricsStoreSchema)!;
        metrics.records.unshift({
            sessionId: 'orphaned-session', seed: 9, dealerMode: 'shuffled', startedAt: Date.now() - 1000,
            cardsDealt: 3, positives: 1, superlikes: 0, probesShown: 0, extensionUsed: false,
        });
        saveVersioned(storage, STORAGE_KEYS.metrics, metrics);
        store.leaveToHome();
        expect(store.restoreActive()).toBe(true);
        const swept = loadVersioned(storage, STORAGE_KEYS.metrics, metricsStoreSchema)!;
        expect(swept.records.find((r) => r.sessionId === 'orphaned-session')!.endedVia).toBe('abandoned');
        expect(swept.records.find((r) => r.sessionId === liveSessionId)!.endedVia).toBeUndefined();
    });

    it('saveAndFinish writes the history record (with shownIds), finalises metrics, clears the active key', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        for (let i = 0; i < 4; i++) {
            store.dispatch({ type: 'swipe', dishId: store.state.value!.currentCard!, reaction: 'like' });
        }
        let bracket = store.state.value!.bracket!;
        while (!bracket.complete) {
            const match = bracket.matches[bracket.currentMatchIndex]!;
            store.dispatch({ type: 'bracketPick', matchIndex: bracket.currentMatchIndex, winnerId: match.a! });
            bracket = store.state.value!.bracket!;
        }
        store.dispatch({ type: 'crown', dishId: bracket.championId!, source: 'bracket' });
        const sessionId = store.sessionId.value!;
        store.saveAndFinish();

        expect(storage.getItem(STORAGE_KEYS.active)).toBeNull();
        const history = loadVersioned(storage, STORAGE_KEYS.history, historyStoreSchema)!;
        expect(history.records[0]!.sessionId).toBe(sessionId);
        expect(history.records[0]!.source).toBe('bracket');
        expect(history.records[0]!.shownIds.length).toBeGreaterThanOrEqual(4);
        const metrics = loadVersioned(storage, STORAGE_KEYS.metrics, metricsStoreSchema)!;
        expect(metrics.records.find((r) => r.sessionId === sessionId)!.endedVia).toBe('bracket');
        expect(metrics.records.find((r) => r.sessionId === sessionId)!.timeToChampionMs).toBeDefined();
    });

    it('refuses the whole dispatch when the event log is full (persisted envelope always re-folds to live state)', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        // swipe/undo cycles are the only unbounded event source: fill the log to the cap.
        while (storedEnvelope().events.length < defaultTuning.EVENT_LOG_MAX - 1) {
            store.dispatch({ type: 'swipe', dishId: store.state.value!.currentCard!, reaction: 'dislike' });
            store.dispatch({ type: 'undo' });
        }
        store.dispatch({ type: 'swipe', dishId: store.state.value!.currentCard!, reaction: 'like' });
        expect(storedEnvelope().events).toHaveLength(defaultTuning.EVENT_LOG_MAX);
        const before = store.state.value!;
        const accepted = store.dispatch({ type: 'swipe', dishId: before.currentCard!, reaction: 'like' });
        expect(accepted).toBe(false);
        expect(store.state.value).toBe(before);   // state unchanged, envelope untouched
        expect(storedEnvelope().events).toHaveLength(defaultTuning.EVENT_LOG_MAX);
        // The undo control disables well before the cap.
        expect(store.undoDisabled.value).toBe(true);
    });

    it('an illegal event is dropped (prod path): dispatch returns false and state is unchanged', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        const before = store.state.value!;
        expect(store.dispatch({ type: 'sorted' })).toBe(false);
        expect(store.state.value).toBe(before);
    });

    it('toggleEaten flips and persists', () => {
        const store = useSessionStore();
        store.startNew({ seed: 2, mode: 'takeaway' });
        const sessionId = store.sessionId.value!;
        store.metrics.toggleEaten(sessionId);
        expect(store.metrics.load().find((r) => r.sessionId === sessionId)!.eaten).toBe(true);
        store.metrics.toggleEaten(sessionId);
        expect(store.metrics.load().find((r) => r.sessionId === sessionId)!.eaten).toBe(false);
    });
});
