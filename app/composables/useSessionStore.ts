import { computed, shallowRef, triggerRef } from 'vue';
import { deck, deckById } from '#shared/data/deck';
import { hashDeck } from '#shared/data/deckHash';
import { ENGINE_VERSION } from '#shared/engine/version';
import { defaultTuning } from '#shared/tuning';
import { createEngineContext, resolveDealerMode, selectProbe } from '#shared/engine/dealer';
import {
    createInitialState, reduce, viewOf, IllegalTransitionError,
} from '#shared/session/reducer';
import { canUndo as canUndoSelector } from '#shared/session/selectors';
import { replaySession, envelopeFor, ReplayVersionMismatchError } from '#shared/session/replay';
import { openMetrics, projectMetrics } from '#shared/session/metricsProjection';
import { loadVersioned, saveVersioned, safeRemove } from '#shared/persistence/migrate';
import {
    STORAGE_KEYS, activeStoreSchema, historyStoreSchema, metricsStoreSchema, prefsStoreSchema,
    historyMigrations, prefsMigrations,
} from '#shared/persistence/schemas';
import type { HistoryRecord, MetricsRecord } from '#shared/types/records';
import type {
    DealerContext, SessionEnvelope, SessionEvent, SessionState,
} from '#shared/types/session';
import type { Mode } from '#shared/types/dish';
import { appStorage } from '~/utils/storage';

export type ShellKind = 'home' | 'restoring' | 'active';

const ctx = createEngineContext(deck, defaultTuning);
const currentDeckHash = hashDeck(deck);

// Module-level singletons shared across components (client-only usage; /play is ssr:false).
const shell = shallowRef<ShellKind>('home');
const state = shallowRef<SessionState | null>(null);
let envelope: SessionEnvelope | null = null;
let metrics: MetricsRecord | null = null;

function storage() {
    return appStorage();
}

function persistActive(): void {
    if (envelope === null) return;
    saveVersioned(storage(), STORAGE_KEYS.active, { v: 1, envelope });
}

function loadMetricsStore(): MetricsRecord[] {
    return loadVersioned(storage(), STORAGE_KEYS.metrics, metricsStoreSchema)?.records ?? [];
}

function persistMetricsRecord(record: MetricsRecord): void {
    const records = loadMetricsStore();
    const index = records.findIndex((r) => r.sessionId === record.sessionId);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    saveVersioned(storage(), STORAGE_KEYS.metrics, { v: 1, records: records.slice(0, defaultTuning.METRICS_KEEP) });
}

function loadHistory(): HistoryRecord[] {
    return loadVersioned(storage(), STORAGE_KEYS.history, historyStoreSchema, historyMigrations)?.records ?? [];
}

function persistHistory(records: HistoryRecord[]): void {
    saveVersioned(storage(), STORAGE_KEYS.history, { v: 1, records: records.slice(0, defaultTuning.HISTORY_KEEP) });
}

function markMetricsAbandoned(sessionId: string): void {
    const records = loadMetricsStore();
    const record = records.find((r) => r.sessionId === sessionId && r.endedAt === undefined);
    if (record) {
        record.endedAt = Date.now();
        record.endedVia = 'abandoned';
        saveVersioned(storage(), STORAGE_KEYS.metrics, { v: 1, records });
    }
}

// Launch sweep: any open metrics record that does not belong to the (still restorable)
// active envelope is an abandoned session (§8).
function sweepAbandonedMetrics(activeSessionId: string | null): void {
    const records = loadMetricsStore();
    let dirty = false;
    for (const record of records) {
        if (record.endedAt === undefined && record.sessionId !== activeSessionId) {
            record.endedAt = Date.now();
            record.endedVia = 'abandoned';
            dirty = true;
        }
    }
    if (dirty) saveVersioned(storage(), STORAGE_KEYS.metrics, { v: 1, records });
}

function dealerContextFromHistory(mode: Mode): DealerContext {
    const history = loadHistory();
    const newest = history[0];
    const seenChampions = new Set<string>();
    const historyChampionIds: string[] = [];
    for (const record of history) {
        // Deck pruning is expected (§4): champions no longer in the deck can't be offered.
        if (record.mode === mode && deckById.has(record.championId) && !seenChampions.has(record.championId)) {
            seenChampions.add(record.championId);
            historyChampionIds.push(record.championId);
        }
    }
    return {
        recentChampions: history.map((r) => ({ dishId: r.championId, ts: r.ts })),
        lastSessionShownIds: newest?.shownIds ?? [],
        historyChampionIds,
    };
}

function discardActive(reason: 'stale' | 'corrupt' | 'replaced' | 'finished'): void {
    const stored = loadVersioned(storage(), STORAGE_KEYS.active, activeStoreSchema);
    if (stored !== null && reason !== 'finished') markMetricsAbandoned(stored.envelope.sessionId);
    safeRemove(storage(), STORAGE_KEYS.active);
    envelope = null;
    metrics = null;
    state.value = null;
}

export function useSessionStore() {
    // Transactional: everything is computed first (reduce is pure), then committed only if
    // ALL resulting events fit the log — a refused dispatch changes nothing, so the
    // persisted envelope always re-folds to the live state, even at the log boundary.
    function dispatch(event: SessionEvent): boolean {
        try {
            if (state.value === null || envelope === null) throw new Error('no active session');
            const applied: SessionEvent[] = [event];
            let next = reduce(ctx, state.value, event);
            // Probe atomicity: the streak-triggering event and probeShown commit as one unit,
            // so a reload can never land between them.
            if (next.phase === 'probe' && next.probe !== null && next.probe.dishIds === null) {
                const dishIds = selectProbe(ctx, viewOf(next));
                if (dishIds !== null) {
                    const shown: SessionEvent = { type: 'probeShown', dishIds };
                    next = reduce(ctx, next, shown);
                    applied.push(shown);
                }
            }
            if (envelope.events.length + applied.length > defaultTuning.EVENT_LOG_MAX) {
                throw new IllegalTransitionError(state.value.phase, event.type, 'event log full');
            }
            envelope.events.push(...applied);
            state.value = next;
            triggerRef(state);
            if (metrics !== null) {
                metrics = projectMetrics(metrics, event, next, Date.now());
                persistMetricsRecord(metrics);
            }
            persistActive();
            return true;
        } catch (error) {
            if (import.meta.dev) throw error;
            console.warn('[tindish] dropped event', event.type, error);
            return false;
        }
    }

    function startNew(options: { seed: number; mode: Mode }): void {
        const existing = loadVersioned(storage(), STORAGE_KEYS.active, activeStoreSchema);
        if (existing !== null) discardActive('replaced');
        const config = {
            sessionId: typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `session-${Date.now()}-${options.seed}`,
            seed: options.seed >>> 0,
            mode: options.mode,
            dealerContext: dealerContextFromHistory(options.mode),
            startedAt: Date.now(),
        };
        envelope = envelopeFor(config, deck, defaultTuning);
        state.value = createInitialState(config, ctx);
        metrics = openMetrics(config, resolveDealerMode(defaultTuning, config.seed));
        persistMetricsRecord(metrics);
        persistActive();
        shell.value = 'active';
    }

    // Returns true when an active session was restored; false lands the caller on home.
    function restoreActive(): boolean {
        shell.value = 'restoring';
        const stored = loadVersioned(storage(), STORAGE_KEYS.active, activeStoreSchema);
        sweepAbandonedMetrics(stored?.envelope.sessionId ?? null);
        if (stored === null) {
            shell.value = 'home';
            return false;
        }
        const env = stored.envelope;
        if (Date.now() - env.startedAt > defaultTuning.ACTIVE_SESSION_MAX_AGE_MS) {
            discardActive('stale');
            shell.value = 'home';
            return false;
        }
        try {
            let restored = replaySession(env, deck, defaultTuning);
            if (restored.phase === 'saved' || restored.phase === 'ended') {
                discardActive('finished');
                shell.value = 'home';
                return false;
            }
            envelope = env;
            state.value = restored;
            metrics = loadMetricsStore().find((r) => r.sessionId === env.sessionId)
                ?? openMetrics(replayConfig(env), restored.dealerMode);
            shell.value = 'active';
            // Defensive completions for envelopes persisted between paired events — neither
            // should occur (dispatch is transactional; the final tap crowns atomically), but
            // a dangling state must restore forward, never render a dead end.
            if (restored.phase === 'probe' && restored.probe?.dishIds === null) {
                const dishIds = selectProbe(ctx, viewOf(restored));
                if (dishIds !== null) dispatch({ type: 'probeShown', dishIds });
            }
            if (restored.phase === 'bracket' && restored.bracket?.complete && restored.championId === null) {
                dispatch({ type: 'crown', dishId: restored.bracket.championId!, source: 'bracket' });
            }
            return true;
        } catch (error) {
            if (error instanceof ReplayVersionMismatchError) console.info('[tindish] active session predates current build — discarded');
            discardActive('corrupt');
            shell.value = 'home';
            return false;
        }
    }

    // Launch hygiene for pages that never enter a session (home, /debug): discard a stale
    // or version-mismatched active envelope and close orphaned metrics records, so ruling 4
    // ("discarded on launch, marked abandoned") holds without visiting /play.
    function launchSweep(): void {
        const stored = loadVersioned(storage(), STORAGE_KEYS.active, activeStoreSchema);
        if (stored !== null) {
            const env = stored.envelope;
            const invalid = Date.now() - env.startedAt > defaultTuning.ACTIVE_SESSION_MAX_AGE_MS
                || env.engineVersion !== ENGINE_VERSION
                || env.deckHash !== currentDeckHash
                || env.tuningVersion !== defaultTuning.tuningVersion;
            if (invalid) {
                discardActive('stale');
                sweepAbandonedMetrics(null);
                return;
            }
            sweepAbandonedMetrics(env.sessionId);
            return;
        }
        sweepAbandonedMetrics(null);
    }

    function replayConfig(env: SessionEnvelope) {
        return {
            sessionId: env.sessionId,
            seed: env.seed,
            mode: env.mode,
            dealerContext: env.dealerContext,
            startedAt: env.startedAt,
        };
    }

    function saveAndFinish(): void {
        const s = state.value;
        if (s === null || envelope === null || s.phase !== 'match' || s.championId === null) return;
        if (!dispatch({ type: 'sorted' })) return;
        const record: HistoryRecord = {
            sessionId: envelope.sessionId,
            seed: envelope.seed,
            engineVersion: envelope.engineVersion,
            deckHash: envelope.deckHash,
            tuningVersion: envelope.tuningVersion,
            events: [...envelope.events],
            mode: envelope.mode,
            dealerContext: envelope.dealerContext,
            startedAt: envelope.startedAt,
            shownIds: [...state.value!.shownIds],
            championId: state.value!.championId!,
            ...(state.value!.runnerUpId !== null ? { runnerUpId: state.value!.runnerUpId } : {}),
            source: state.value!.crownSource!,
            usedRunnerUp: state.value!.usedRunnerUp,
            ts: Date.now(),
        };
        persistHistory([record, ...loadHistory()]);
        safeRemove(storage(), STORAGE_KEYS.active);
        envelope = null;
        metrics = null;
    }

    function endSession(): void {
        if (state.value === null) return;
        if (dispatch({ type: 'end' })) {
            safeRemove(storage(), STORAGE_KEYS.active);
            envelope = null;
            metrics = null;
        }
    }

    function leaveToHome(): void {
        shell.value = 'home';
        state.value = null;
        envelope = null;
        metrics = null;
    }

    return {
        ctx,
        shell,
        state,
        dispatch,
        startNew,
        restoreActive,
        launchSweep,
        saveAndFinish,
        endSession,
        leaveToHome,
        undoDisabled: computed(() =>
            state.value === null
            || !canUndoSelector(state.value)
            || (envelope?.events.length ?? 0) >= defaultTuning.UNDO_LOG_CEILING),
        currentDish: computed(() => {
            const id = state.value?.currentCard;
            return id ? deckById.get(id) ?? null : null;
        }),
        sessionId: computed(() => envelope?.sessionId ?? null),
        history: { load: loadHistory },
        metrics: {
            load: loadMetricsStore,
            toggleEaten(sessionId: string) {
                const records = loadMetricsStore();
                const record = records.find((r) => r.sessionId === sessionId);
                if (record) {
                    record.eaten = record.eaten !== true;
                    saveVersioned(storage(), STORAGE_KEYS.metrics, { v: 1, records });
                }
            },
        },
        prefs: {
            load: () => loadVersioned(storage(), STORAGE_KEYS.prefs, prefsStoreSchema, prefsMigrations),
            save(mode: Mode) {
                saveVersioned(storage(), STORAGE_KEYS.prefs, { v: 1, mode });
            },
        },
    };
}
