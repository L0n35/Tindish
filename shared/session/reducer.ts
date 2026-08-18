import type { Phase, SessionConfig, SessionEvent, SessionState } from '../types/session';
import { applyReaction } from '../engine/scoring';
import { filterCandidates } from '../engine/candidates';
import { selectOpeningTrio } from '../engine/openingTrio';
import { deriveRng } from '../engine/rng';
import { seedFinalists, createBracket, reportWinner, finalLoser } from '../engine/bracket';
import { resolveByPositives } from '../engine/stop';
import {
    dealNext, penaltyContextOf, resolveDealerMode, selectProbe,
    type DealerView, type EngineContext,
} from '../engine/dealer';

export class IllegalTransitionError extends Error {
    constructor(readonly phase: Phase, readonly eventType: SessionEvent['type'], detail?: string) {
        super(`illegal event '${eventType}' in phase '${phase}'${detail ? `: ${detail}` : ''}`);
        this.name = 'IllegalTransitionError';
    }
}

export class ReplayIntegrityError extends Error {
    constructor(detail: string) {
        super(`recorded event contradicts recomputation: ${detail}`);
        this.name = 'ReplayIntegrityError';
    }
}

export function viewOf(state: SessionState): DealerView {
    return {
        seed: state.config.seed,
        mode: state.config.mode,
        effortFilter: state.config.effortFilter,
        dealerMode: state.dealerMode,
        dealerContext: state.config.dealerContext,
        stats: state.engine.stats,
        dealtIds: state.dealtIds,
        shownIds: state.shownIds,
        queuedIds: state.dealQueue,
        cardsDealt: state.cardsDealt,
        // The 24h penalty window is evaluated against session start, never wall-clock —
        // replaying yesterday's log must apply yesterday's penalties.
        now: state.config.startedAt,
    };
}

export function createInitialState(config: SessionConfig, ctx: EngineContext): SessionState {
    const dealerMode = resolveDealerMode(ctx.tuning, config.seed);
    const base: SessionState = {
        phase: 'swiping',
        config,
        dealerMode,
        decisionIndex: 0,
        engine: { stats: {} },
        dealtIds: [],
        shownIds: [],
        dealQueue: [],
        currentCard: null,
        cardsDealt: 0,
        cardBudget: ctx.tuning.MAX_CARDS,
        reactions: [],
        positives: [],
        superlikeOrder: [],
        omgUsed: 0,
        dislikeStreak: 0,
        probesUsed: 0,
        probe: null,
        extension: { used: false, active: false },
        hardStopReason: null,
        finalists: null,
        bracket: null,
        championId: null,
        runnerUpId: null,
        crownSource: null,
        usedRunnerUp: false,
        undo: null,
    };

    if (dealerMode === 'adaptive') {
        const candidates = filterCandidates(ctx.deck, {
            mode: config.mode,
            effortFilter: config.effortFilter,
            excludeIds: new Set<string>(),
        });
        const trio = selectOpeningTrio(
            candidates,
            penaltyContextOf(viewOf(base), ctx.tuning),
            ctx.tuning,
            deriveRng(config.seed, 0),
        );
        return {
            ...base,
            decisionIndex: 1,
            currentCard: trio[0].id,
            dealQueue: [trio[1].id, trio[2].id],
            cardsDealt: 1,
            dealtIds: [trio[0].id],
            shownIds: [trio[0].id],
        };
    }

    const first = dealNext(ctx, viewOf(base), deriveRng(config.seed, 0));
    if ('exhausted' in first) throw new Error('deck has no candidates for this mode/filter');
    return {
        ...base,
        decisionIndex: 1,
        currentCard: first.dishId,
        cardsDealt: 1,
        dealtIds: [first.dishId],
        shownIds: [first.dishId],
    };
}

export function reduce(ctx: EngineContext, state: SessionState, event: SessionEvent): SessionState {
    switch (event.type) {
        case 'swipe': return onSwipe(ctx, state, event);
        case 'undo': return onUndo(state, event);
        case 'probeShown': return onProbeShown(ctx, state, event);
        case 'probePick': return onProbePick(ctx, state, event);
        case 'probeNone': return onProbeNone(ctx, state, event);
        case 'extend': return onExtend(ctx, state, event);
        case 'bracketPick': return onBracketPick(state, event);
        case 'crown': return onCrown(ctx, state, event);
        case 'sorted': return onSorted(state, event);
        case 'end': return onEnd(state, event);
    }
}

function illegal(state: SessionState, event: SessionEvent, detail?: string): never {
    throw new IllegalTransitionError(state.phase, event.type, detail);
}

function enterFinalists(ctx: EngineContext, state: SessionState): SessionState {
    const seeds = seedFinalists({
        positives: state.positives,
        superlikeOrder: state.superlikeOrder,
        reactions: state.reactions,
        stats: state.engine.stats,
        byId: ctx.byId,
        tuning: ctx.tuning,
    });
    return {
        ...state,
        phase: 'finalists',
        finalists: seeds,
        bracket: createBracket(seeds),
        currentCard: null,
    };
}

function hardStop(ctx: EngineContext, state: SessionState, reason: 'maxCards' | 'exhausted'): SessionState {
    const resolved = resolveByPositives(state.positives.length);
    const stopped = { ...state, hardStopReason: reason, currentCard: null };
    if (resolved === 'finalists') return enterFinalists(ctx, stopped);
    return { ...stopped, phase: resolved };
}

function deal(ctx: EngineContext, state: SessionState): SessionState {
    if (state.dealQueue.length > 0) {
        const [next, ...rest] = state.dealQueue;
        return {
            ...state,
            phase: 'swiping',
            currentCard: next!,
            dealQueue: rest,
            cardsDealt: state.cardsDealt + 1,
            dealtIds: [...state.dealtIds, next!],
            shownIds: [...state.shownIds, next!],
        };
    }
    const result = dealNext(ctx, viewOf(state), deriveRng(state.config.seed, state.decisionIndex));
    if ('exhausted' in result) return hardStop(ctx, state, 'exhausted');
    return {
        ...state,
        phase: 'swiping',
        currentCard: result.dishId,
        decisionIndex: state.decisionIndex + 1,
        cardsDealt: state.cardsDealt + 1,
        dealtIds: [...state.dealtIds, result.dishId],
        shownIds: [...state.shownIds, result.dishId],
    };
}

// Resolution ladder after a committed reaction (strict priority):
// 1. TARGET_POSITIVES reached → finalists, instantly.
// 2. Streak threshold on a committed dislike, probe available → probe (checked before the
//    hard stop: a rescue beats a 0-positive fallback when the 7th dislike lands at the cap).
// 3. Budget hit → resolve by positives.  4. Otherwise deal the next card.
function resolveAfterReaction(ctx: EngineContext, state: SessionState, wasDislike: boolean): SessionState {
    if (state.positives.length >= ctx.tuning.TARGET_POSITIVES) return enterFinalists(ctx, state);
    if (
        wasDislike
        && state.dislikeStreak >= ctx.tuning.STREAK_THRESHOLD
        && state.probesUsed < ctx.tuning.MAX_PROBES
        && selectProbe(ctx, viewOf(state)) !== null
    ) {
        return { ...state, phase: 'probe', probe: { dishIds: null }, currentCard: null };
    }
    if (state.cardsDealt >= state.cardBudget) return hardStop(ctx, state, 'maxCards');
    return deal(ctx, state);
}

function onSwipe(ctx: EngineContext, state: SessionState, event: Extract<SessionEvent, { type: 'swipe' }>): SessionState {
    if (state.phase !== 'swiping') illegal(state, event);
    if (event.dishId !== state.currentCard) illegal(state, event, `expected card ${state.currentCard}`);
    if (event.reaction === 'superlike' && state.omgUsed >= ctx.tuning.OMG_CAP) {
        illegal(state, event, 'OMG cap reached');
    }

    const prev: SessionState = { ...state, undo: null };
    const positive = event.reaction !== 'dislike';
    const applied: SessionState = {
        ...state,
        engine: { stats: applyReaction(state.engine.stats, ctx.byId.get(event.dishId)!, event.reaction, ctx.tuning) },
        reactions: [...state.reactions, { dishId: event.dishId, reaction: event.reaction }],
        positives: positive ? [...state.positives, event.dishId] : state.positives,
        superlikeOrder: event.reaction === 'superlike' ? [...state.superlikeOrder, event.dishId] : state.superlikeOrder,
        omgUsed: event.reaction === 'superlike' ? state.omgUsed + 1 : state.omgUsed,
        dislikeStreak: positive ? 0 : state.dislikeStreak + 1,
        currentCard: null,
        undo: null,
    };

    const resolved = resolveAfterReaction(ctx, applied, !positive);
    const undoable = resolved.phase === 'swiping' || resolved.phase === 'finalists';
    return { ...resolved, undo: undoable ? { prev } : null };
}

function onUndo(state: SessionState, event: SessionEvent): SessionState {
    if ((state.phase !== 'swiping' && state.phase !== 'finalists') || state.undo === null) {
        illegal(state, event);
    }
    return { ...state.undo.prev, undo: null };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

function onProbeShown(ctx: EngineContext, state: SessionState, event: Extract<SessionEvent, { type: 'probeShown' }>): SessionState {
    if (state.phase !== 'probe' || state.probe === null || state.probe.dishIds !== null) illegal(state, event);
    const recomputed = selectProbe(ctx, viewOf(state));
    if (recomputed === null || !sameIds(recomputed, event.dishIds)) {
        throw new ReplayIntegrityError(
            `probeShown ids [${event.dishIds.join(', ')}] != recomputed [${(recomputed ?? []).join(', ')}]`,
        );
    }
    return {
        ...state,
        probe: { dishIds: [...event.dishIds] },
        shownIds: [...state.shownIds, ...event.dishIds],
        probesUsed: state.probesUsed + 1,
        undo: null,
    };
}

function onProbePick(ctx: EngineContext, state: SessionState, event: Extract<SessionEvent, { type: 'probePick' }>): SessionState {
    if (state.phase !== 'probe' || state.probe?.dishIds == null) illegal(state, event);
    if (!state.probe.dishIds.includes(event.dishId)) illegal(state, event, `${event.dishId} not on the probe screen`);

    const applied: SessionState = {
        ...state,
        engine: { stats: applyReaction(state.engine.stats, ctx.byId.get(event.dishId)!, 'probePick', ctx.tuning) },
        reactions: [...state.reactions, { dishId: event.dishId, reaction: 'probePick' }],
        positives: [...state.positives, event.dishId],
        dislikeStreak: 0,
        cardsDealt: state.cardsDealt + 1,
        dealtIds: [...state.dealtIds, event.dishId],
        probe: null,
        undo: null,
    };
    return resolveAfterReaction(ctx, applied, false);
}

function onProbeNone(ctx: EngineContext, state: SessionState, event: SessionEvent): SessionState {
    if (state.phase !== 'probe' || state.probe?.dishIds == null) illegal(state, event);
    // The dislike streak deliberately persists (user ruling) — only a positive resets it.
    const applied: SessionState = { ...state, probe: null, undo: null };
    if (applied.probesUsed >= ctx.tuning.MAX_PROBES) {
        const resolved = resolveByPositives(applied.positives.length);
        if (resolved === 'finalists') return enterFinalists(ctx, applied);
        return { ...applied, phase: resolved, currentCard: null };
    }
    if (applied.cardsDealt >= applied.cardBudget) return hardStop(ctx, applied, 'maxCards');
    return deal(ctx, applied);
}

function onExtend(ctx: EngineContext, state: SessionState, event: SessionEvent): SessionState {
    if (state.phase !== 'directOffer' || state.extension.used) illegal(state, event);
    const extended: SessionState = {
        ...state,
        extension: { used: true, active: true },
        cardBudget: state.cardsDealt + ctx.tuning.EXTENSION_CARDS,
        hardStopReason: null,
        undo: null,
    };
    return deal(ctx, extended);
}

function onBracketPick(state: SessionState, event: Extract<SessionEvent, { type: 'bracketPick' }>): SessionState {
    if (state.phase !== 'finalists' && state.phase !== 'bracket') illegal(state, event);
    const bracket = state.bracket;
    if (bracket === null || bracket.complete) illegal(state, event);
    if (event.matchIndex !== bracket.currentMatchIndex) illegal(state, event, `expected match ${bracket.currentMatchIndex}`);
    const match = bracket.matches[event.matchIndex]!;
    if (match.a === null || match.b === null || (event.winnerId !== match.a && event.winnerId !== match.b)) {
        illegal(state, event, `${event.winnerId} is not in match ${event.matchIndex}`);
    }
    return {
        ...state,
        phase: 'bracket',
        bracket: reportWinner(bracket, event.matchIndex, event.winnerId),
        undo: null,
    };
}

function onCrown(ctx: EngineContext, state: SessionState, event: Extract<SessionEvent, { type: 'crown' }>): SessionState {
    if (state.phase === 'bracket' && event.source === 'bracket') {
        if (state.bracket === null || !state.bracket.complete) illegal(state, event, 'bracket not complete');
        if (event.dishId !== state.bracket.championId) {
            throw new ReplayIntegrityError(`crowned ${event.dishId} but bracket champion is ${state.bracket.championId}`);
        }
        return {
            ...state,
            phase: 'match',
            championId: event.dishId,
            runnerUpId: finalLoser(state.bracket),
            crownSource: 'bracket',
            undo: null,
        };
    }
    if (state.phase === 'directOffer' && event.source === 'direct') {
        if (state.positives.length !== 1 || event.dishId !== state.positives[0]) illegal(state, event);
        return { ...state, phase: 'match', championId: event.dishId, runnerUpId: null, crownSource: 'direct', undo: null };
    }
    if (state.phase === 'historyFallback' && event.source === 'history') {
        const offered = state.config.dealerContext.historyChampionIds.slice(0, ctx.tuning.HISTORY_FALLBACK_COUNT);
        if (!offered.includes(event.dishId)) illegal(state, event, `${event.dishId} not among offered history champions`);
        return { ...state, phase: 'match', championId: event.dishId, runnerUpId: null, crownSource: 'history', undo: null };
    }
    if (state.phase === 'match' && event.source === 'bracket') {
        if (state.usedRunnerUp || state.runnerUpId === null || event.dishId !== state.runnerUpId) illegal(state, event);
        return {
            ...state,
            championId: state.runnerUpId,
            runnerUpId: state.championId,
            usedRunnerUp: true,
        };
    }
    illegal(state, event);
}

function onSorted(state: SessionState, event: SessionEvent): SessionState {
    if (state.phase !== 'match') illegal(state, event);
    return { ...state, phase: 'saved', undo: null };
}

function onEnd(state: SessionState, event: SessionEvent): SessionState {
    if (state.phase === 'saved' || state.phase === 'ended') illegal(state, event);
    return { ...state, phase: 'ended', currentCard: null, undo: null };
}
