import { deck } from '../../shared/data/deck';
import { hashDeck } from '../../shared/data/deckHash';
import { ENGINE_VERSION } from '../../shared/engine/version';
import { defaultTuning, type Tuning } from '../../shared/tuning';
import { mulberry32, type Rng } from '../../shared/engine/rng';
import { createEngineContext, selectProbe, type EngineContext } from '../../shared/engine/dealer';
import { createInitialState, reduce, viewOf } from '../../shared/session/reducer';
import { previewNext, extensionAvailable } from '../../shared/session/selectors';
import type { Mode } from '../../shared/types/dish';
import type { SessionConfig, SessionEnvelope, SessionEvent, SessionState } from '../../shared/types/session';
import { agentBracketPick, agentProbeChoice, agentReact, utility, type AgentProfile } from './agents';

export interface SimResult {
    agent: string;
    seed: number;
    mode: Mode;
    dealerMode: SessionState['dealerMode'];
    state: SessionState;
    envelope: SessionEnvelope;
    eventCount: number;
    cardsToFinalists: number | null;
    championUtility: number | null;
}

export function runAgentSession(args: {
    agent: AgentProfile;
    seed: number;
    mode: Mode;
    ctx?: EngineContext;
    tuning?: Tuning;
    withPreviews?: boolean;
}): SimResult {
    const tuning = args.tuning ?? defaultTuning;
    const ctx = args.ctx ?? createEngineContext(deck, tuning);
    const config: SessionConfig = {
        sessionId: `sim-${args.agent.name}-${args.seed}`,
        seed: args.seed,
        mode: args.mode,
        effortFilter: 'noLimit',
        dealerContext: { recentChampions: [], lastSessionShownIds: [], historyChampionIds: [] },
        startedAt: 1_750_000_000_000,
    };
    // Agent noise decorrelated from dealer draws by construction.
    const agentRng: Rng = mulberry32((args.seed ^ 0x9e3779b9) >>> 0);

    let state = createInitialState(config, ctx);
    const events: SessionEvent[] = [];
    const dispatch = (event: SessionEvent) => {
        state = reduce(ctx, state, event);
        events.push(event);
    };

    let cardsToFinalists: number | null = null;
    let guard = 0;
    while (guard++ < 200) {
        const s = state;
        if (s.phase === 'swiping') {
            if (args.withPreviews) {
                previewNext(ctx, s, 'dislike');
                previewNext(ctx, s, 'like');
                previewNext(ctx, s, 'superlike');
            }
            const dish = ctx.byId.get(s.currentCard!)!;
            let reaction = agentReact(args.agent, dish, agentRng);
            if (reaction === 'superlike' && s.omgUsed >= tuning.OMG_CAP) reaction = 'like';
            dispatch({ type: 'swipe', dishId: dish.id, reaction });
        } else if (s.phase === 'probe') {
            if (s.probe!.dishIds === null) {
                const ids = selectProbe(ctx, viewOf(s))!;
                dispatch({ type: 'probeShown', dishIds: ids });
            } else {
                const dishes = s.probe!.dishIds.map((id) => ctx.byId.get(id)!);
                const choice = agentProbeChoice(args.agent, dishes, agentRng);
                dispatch(choice === 'none' ? { type: 'probeNone' } : { type: 'probePick', dishId: choice });
            }
        } else if (s.phase === 'finalists' || s.phase === 'bracket') {
            if (cardsToFinalists === null) cardsToFinalists = s.cardsDealt;
            if (s.bracket!.complete) {
                dispatch({ type: 'crown', dishId: s.bracket!.championId!, source: 'bracket' });
            } else {
                const match = s.bracket!.matches[s.bracket!.currentMatchIndex]!;
                const winner = agentBracketPick(args.agent, ctx.byId.get(match.a!)!, ctx.byId.get(match.b!)!, agentRng);
                dispatch({ type: 'bracketPick', matchIndex: s.bracket!.currentMatchIndex, winnerId: winner });
            }
        } else if (s.phase === 'directOffer') {
            const positive = ctx.byId.get(s.positives[0]!)!;
            if (args.agent.extends && extensionAvailable(ctx, s)) {
                dispatch({ type: 'extend' });
            } else if (utility(args.agent, positive) >= 0) {
                dispatch({ type: 'crown', dishId: positive.id, source: 'direct' });
            } else {
                dispatch({ type: 'end' });
            }
        } else if (s.phase === 'historyFallback') {
            dispatch({ type: 'end' });
        } else if (s.phase === 'match') {
            dispatch({ type: 'sorted' });
        } else {
            break; // saved / ended
        }
    }

    const envelope: SessionEnvelope = {
        v: 1,
        sessionId: config.sessionId,
        seed: config.seed,
        engineVersion: ENGINE_VERSION,
        deckHash: hashDeck(ctx.deck),
        tuningVersion: tuning.tuningVersion,
        mode: config.mode,
        effortFilter: config.effortFilter,
        dealerContext: config.dealerContext,
        startedAt: config.startedAt,
        events,
    };

    return {
        agent: args.agent.name,
        seed: args.seed,
        mode: args.mode,
        dealerMode: state.dealerMode,
        state,
        envelope,
        eventCount: events.length,
        cardsToFinalists,
        championUtility: state.championId ? utility(args.agent, ctx.byId.get(state.championId)!) : null,
    };
}
