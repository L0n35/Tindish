import { deck } from '#shared/data/deck';
import { hashDeck } from '#shared/data/deckHash';
import { ENGINE_VERSION } from '#shared/engine/version';
import { defaultTuning, type Tuning } from '#shared/tuning';
import { createEngineContext, selectProbe, type EngineContext } from '#shared/engine/dealer';
import { createInitialState, reduce, viewOf } from '#shared/session/reducer';
import type {
    DealerContext, SessionConfig, SessionEvent, SessionState, SwipeReaction,
} from '#shared/types/session';

export const baseContext: EngineContext = createEngineContext(deck, defaultTuning);

export function makeCtx(tuning: Partial<Tuning> = {}): EngineContext {
    return createEngineContext(deck, { ...defaultTuning, ...tuning });
}

export function makeDealerContext(overrides: Partial<DealerContext> = {}): DealerContext {
    return { recentChampions: [], lastSessionShownIds: [], historyChampionIds: [], ...overrides };
}

export function makeConfig(seed: number, overrides: Partial<SessionConfig> = {}): SessionConfig {
    return {
        sessionId: `test-session-${seed}`,
        seed,
        mode: 'takeaway',
        dealerContext: makeDealerContext(),
        startedAt: 1_750_000_000_000,
        ...overrides,
    };
}

export function start(seed: number, ctx = baseContext, overrides: Partial<SessionConfig> = {}): SessionState {
    return createInitialState(makeConfig(seed, overrides), ctx);
}

export function sw(ctx: EngineContext, state: SessionState, reaction: SwipeReaction): SessionState {
    if (state.currentCard === null) throw new Error(`no current card in phase ${state.phase}`);
    return reduce(ctx, state, { type: 'swipe', dishId: state.currentCard, reaction });
}

export function swipeMany(ctx: EngineContext, state: SessionState, reactions: SwipeReaction[]): SessionState {
    let s = state;
    for (const r of reactions) s = sw(ctx, s, r);
    return s;
}

export function dislikeUntil(
    ctx: EngineContext,
    state: SessionState,
    predicate: (s: SessionState) => boolean,
    maxIterations = 40,
): SessionState {
    let s = state;
    for (let i = 0; i < maxIterations; i++) {
        if (predicate(s)) return s;
        if (s.phase !== 'swiping') throw new Error(`left swiping (phase ${s.phase}) before predicate held`);
        s = sw(ctx, s, 'dislike');
    }
    if (predicate(s)) return s;
    throw new Error('predicate never held');
}

export function showProbe(ctx: EngineContext, state: SessionState): SessionState {
    const ids = selectProbe(ctx, viewOf(state));
    if (ids === null) throw new Error('probe unavailable');
    return reduce(ctx, state, { type: 'probeShown', dishIds: ids });
}

export function playBracketToChampion(ctx: EngineContext, state: SessionState, pickFirst = true): SessionState {
    let s = state;
    while (s.bracket !== null && !s.bracket.complete) {
        const match = s.bracket.matches[s.bracket.currentMatchIndex]!;
        const winner = pickFirst ? match.a! : match.b!;
        s = reduce(ctx, s, { type: 'bracketPick', matchIndex: s.bracket.currentMatchIndex, winnerId: winner });
    }
    return reduce(ctx, s, { type: 'crown', dishId: s.bracket!.championId!, source: 'bracket' });
}

export function eventsOf(...events: SessionEvent[]): SessionEvent[] {
    return events;
}

// Event-recording driver: every dispatch both reduces and appends to the log, so any
// test session can be re-folded through replaySession and compared to the live state.
export class TestSession {
    state: SessionState;
    readonly events: SessionEvent[] = [];

    constructor(readonly ctx: EngineContext, readonly config: SessionConfig) {
        this.state = createInitialState(config, ctx);
    }

    dispatch(event: SessionEvent): SessionState {
        this.state = reduce(this.ctx, this.state, event);
        this.events.push(event);
        return this.state;
    }

    swipe(reaction: SwipeReaction): SessionState {
        if (this.state.currentCard === null) throw new Error(`no current card in phase ${this.state.phase}`);
        return this.dispatch({ type: 'swipe', dishId: this.state.currentCard, reaction });
    }

    showProbe(): SessionState {
        const ids = selectProbe(this.ctx, viewOf(this.state));
        if (ids === null) throw new Error('probe unavailable');
        return this.dispatch({ type: 'probeShown', dishIds: ids });
    }

    envelope(): import('#shared/types/session').SessionEnvelope {
        return {
            v: 1,
            sessionId: this.config.sessionId,
            seed: this.config.seed,
            engineVersion: ENGINE_VERSION,
            deckHash: hashDeck(this.ctx.deck),
            tuningVersion: this.ctx.tuning.tuningVersion,
            mode: this.config.mode,
            dealerContext: this.config.dealerContext,
            startedAt: this.config.startedAt,
            events: [...this.events],
        };
    }
}
