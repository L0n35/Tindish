import type { BracketMatch, SessionState, SwipeReaction } from '../types/session';
import type { Tuning } from '../tuning';
import { extensionHasCandidates, type EngineContext } from '../engine/dealer';
import { reduce, viewOf } from './reducer';

export type PreviewOutcome =
    | { kind: 'card'; dishId: string }
    | { kind: 'probe' }
    | { kind: 'finalists' }
    | { kind: 'directOffer' }
    | { kind: 'historyFallback' }
    | { kind: 'bounce' };

// Pure and exactly predictive: a preview literally recomputes the real transition on an
// immutable copy — same decisionIndex, same derivation — then discards the result state.
export function previewNext(ctx: EngineContext, state: SessionState, reaction: SwipeReaction): PreviewOutcome {
    if (state.phase !== 'swiping' || state.currentCard === null) {
        throw new Error(`previewNext called outside swiping (phase ${state.phase})`);
    }
    if (reaction === 'superlike' && state.omgUsed >= ctx.tuning.OMG_CAP) return { kind: 'bounce' };
    const next = reduce(ctx, state, { type: 'swipe', dishId: state.currentCard, reaction });
    switch (next.phase) {
        case 'swiping': return { kind: 'card', dishId: next.currentCard! };
        case 'probe': return { kind: 'probe' };
        case 'finalists': return { kind: 'finalists' };
        case 'directOffer': return { kind: 'directOffer' };
        case 'historyFallback': return { kind: 'historyFallback' };
        default: throw new Error(`unexpected preview phase ${next.phase}`);
    }
}

export function canUndo(state: SessionState): boolean {
    return (state.phase === 'swiping' || state.phase === 'finalists') && state.undo !== null;
}

export function currentMatch(state: SessionState): BracketMatch | null {
    if (state.bracket === null || state.bracket.complete) return null;
    return state.bracket.matches[state.bracket.currentMatchIndex] ?? null;
}

export function extensionAvailable(ctx: EngineContext, state: SessionState): boolean {
    return state.phase === 'directOffer'
        && !state.extension.used
        && extensionHasCandidates(ctx, viewOf(state));
}

export function historyOffers(state: SessionState, tuning: Tuning): string[] {
    return state.config.dealerContext.historyChampionIds.slice(0, tuning.HISTORY_FALLBACK_COUNT);
}

export interface TopPreference {
    dimension: string;
    value: string;
    score: number;
}

export function topPreferences(state: SessionState, tuning: Tuning, n: number): TopPreference[] {
    return Object.entries(state.engine.stats)
        .map(([key, stat]) => {
            const sep = key.indexOf(':');
            return {
                dimension: key.slice(0, sep),
                value: key.slice(sep + 1),
                score: stat.sum / (stat.count + tuning.K),
            };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => (b.score - a.score) || (a.value < b.value ? -1 : 1))
        .slice(0, n);
}
