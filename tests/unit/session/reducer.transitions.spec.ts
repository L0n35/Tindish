import { describe, expect, it } from 'vitest';
import { deck } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { reduce, viewOf, IllegalTransitionError } from '#shared/session/reducer';
import { createEngineContext, selectProbe, type EngineContext } from '#shared/engine/dealer';
import { extensionAvailable } from '#shared/session/selectors';
import type { Phase, SessionEvent, SessionState } from '#shared/types/session';
import {
    baseContext, dislikeUntil, makeCtx, playBracketToChampion, showProbe, start, sw, swipeMany,
} from '../../helpers/session';

// Probe-free context: MAX_PROBES 0 keeps long dislike runs in `swiping`, which makes
// hard-stop states constructible without weaving through probe screens.
const ctxNoProbes = makeCtx({ MAX_PROBES: 0 });

function directOfferState(): SessionState {
    let s = sw(ctxNoProbes, start(2, ctxNoProbes), 'like');
    while (s.phase === 'swiping') s = sw(ctxNoProbes, s, 'dislike');
    if (s.phase !== 'directOffer') throw new Error(`expected directOffer, got ${s.phase}`);
    return s;
}

// Build one representative state per phase (seed 2 = adaptive).
function stateIn(phase: Phase): SessionState {
    const ctx = baseContext;
    switch (phase) {
        case 'swiping': return start(2);
        case 'probe': return dislikeUntil(ctx, start(2), (s) => s.phase === 'probe');
        case 'finalists': return swipeMany(ctx, start(2), ['like', 'like', 'like', 'like']);
        case 'bracket': {
            const s = stateIn('finalists');
            return reduce(ctx, s, { type: 'bracketPick', matchIndex: 0, winnerId: s.bracket!.matches[0]!.a! });
        }
        case 'directOffer': return directOfferState();
        case 'historyFallback': {
            let s = dislikeUntil(ctx, start(2), (x) => x.phase === 'probe');
            s = showProbe(ctx, s);
            s = reduce(ctx, s, { type: 'probeNone' });
            s = dislikeUntil(ctx, s, (x) => x.phase === 'probe', 60);
            s = showProbe(ctx, s);
            s = reduce(ctx, s, { type: 'probeNone' });
            if (s.phase !== 'historyFallback') throw new Error(`expected historyFallback, got ${s.phase}`);
            return s;
        }
        case 'match': return playBracketToChampion(baseContext, stateIn('finalists'));
        case 'saved': return reduce(ctx, stateIn('match'), { type: 'sorted' });
        case 'ended': return reduce(ctx, stateIn('swiping'), { type: 'end' });
    }
}

const sampleEvents: Record<SessionEvent['type'], (s: SessionState) => SessionEvent> = {
    swipe: (s) => ({ type: 'swipe', dishId: s.currentCard ?? 'chicken-pad-thai', reaction: 'like' }),
    undo: () => ({ type: 'undo' }),
    probeShown: (s) => ({ type: 'probeShown', dishIds: selectProbe(baseContext, viewOf(s)) ?? ['a', 'b', 'c', 'd'] }),
    probePick: (s) => ({ type: 'probePick', dishId: s.probe?.dishIds?.[0] ?? 'chicken-pad-thai' }),
    probeNone: () => ({ type: 'probeNone' }),
    extend: () => ({ type: 'extend' }),
    bracketPick: (s) => ({
        type: 'bracketPick',
        matchIndex: s.bracket?.currentMatchIndex ?? 0,
        winnerId: s.bracket?.matches[s.bracket.currentMatchIndex]?.a ?? 'chicken-pad-thai',
    }),
    crown: (s) => ({
        type: 'crown',
        dishId: s.bracket?.championId ?? s.positives[0] ?? 'chicken-pad-thai',
        source: 'bracket',
    }),
    sorted: () => ({ type: 'sorted' }),
    end: () => ({ type: 'end' }),
};

// The legality matrix: which event types are ever legal per phase (given a suitable payload).
const legal: Record<Phase, SessionEvent['type'][]> = {
    swiping: ['swipe', 'undo', 'end'],
    probe: ['probeShown', 'probePick', 'probeNone', 'end'],
    finalists: ['bracketPick', 'undo', 'end'],
    directOffer: ['crown', 'extend', 'end'],
    historyFallback: ['crown', 'end'],
    bracket: ['bracketPick', 'crown', 'end'],
    match: ['crown', 'sorted', 'end'],
    saved: [],
    ended: [],
};

describe('reducer legality matrix', () => {
    const phases = Object.keys(legal) as Phase[];
    const eventTypes = Object.keys(sampleEvents) as SessionEvent['type'][];

    it.each(phases)('phase %s rejects every off-table event with IllegalTransitionError', (phase) => {
        const state = stateIn(phase);
        for (const type of eventTypes) {
            if (legal[phase].includes(type)) continue;
            const event = sampleEvents[type](state);
            expect(() => reduce(baseContext, state, event), `${type} in ${phase}`)
                .toThrow(IllegalTransitionError);
        }
    });

    it('undo throws even in swiping/finalists when there is nothing to undo', () => {
        expect(() => reduce(baseContext, start(2), { type: 'undo' })).toThrow(IllegalTransitionError);
    });

    it('crown with the wrong source for the phase throws', () => {
        const offer = stateIn('directOffer');
        expect(() => reduce(ctxNoProbes, offer, { type: 'crown', dishId: offer.positives[0]!, source: 'history' }))
            .toThrow(IllegalTransitionError);
    });
});

describe('stop rules', () => {
    it('a 4-swipe session (4 straight positives) reaches finalists instantly', () => {
        const s = swipeMany(baseContext, start(2), ['like', 'like', 'like', 'like']);
        expect(s.phase).toBe('finalists');
        expect(s.cardsDealt).toBe(4);
        expect(s.finalists).toHaveLength(4);
        expect(s.bracket).not.toBeNull();
    });

    it('hard stop at MAX_CARDS routes 2 positives to finalists (straight final)', () => {
        let s = swipeMany(ctxNoProbes, start(2, ctxNoProbes), ['like', 'like']);
        while (s.phase === 'swiping') s = sw(ctxNoProbes, s, 'dislike');
        expect(s.phase).toBe('finalists');
        expect(s.cardsDealt).toBe(defaultTuning.MAX_CARDS);
        expect(s.hardStopReason).toBe('maxCards');
        expect(s.finalists).toHaveLength(2);
        expect(s.bracket!.matches).toHaveLength(1);
    });

    it('hard stop with 0 positives reaches historyFallback', () => {
        let s = start(2, ctxNoProbes);
        while (s.phase === 'swiping') s = sw(ctxNoProbes, s, 'dislike');
        expect(s.phase).toBe('historyFallback');
    });

    it('hard stop with exactly 1 positive reaches directOffer with extend available', () => {
        const s = directOfferState();
        expect(s.positives).toHaveLength(1);
        expect(s.extension.used).toBe(false);
        expect(extensionAvailable(ctxNoProbes, s)).toBe(true);
    });

    it('extension deals up to 6 more cards; stop-at-4 stays live during it', () => {
        let s = directOfferState();
        const dealtBefore = s.cardsDealt;
        s = reduce(ctxNoProbes, s, { type: 'extend' });
        expect(s.phase).toBe('swiping');
        expect(s.extension).toEqual({ used: true, active: true });
        expect(s.cardBudget).toBe(dealtBefore + defaultTuning.EXTENSION_CARDS);
        s = swipeMany(ctxNoProbes, s, ['like', 'like', 'like']);
        expect(s.phase).toBe('finalists');   // 1 + 3 = 4 positives → instant stop mid-extension
    });

    it('post-extension exactly-1-positive returns directOffer as crown-or-end (no second extension)', () => {
        let s = directOfferState();
        s = reduce(ctxNoProbes, s, { type: 'extend' });
        while (s.phase === 'swiping') s = sw(ctxNoProbes, s, 'dislike');
        expect(s.phase).toBe('directOffer');
        expect(s.positives).toHaveLength(1);
        expect(s.extension.used).toBe(true);
        expect(extensionAvailable(ctxNoProbes, s)).toBe(false);
        expect(() => reduce(ctxNoProbes, s, { type: 'extend' })).toThrow(IllegalTransitionError);
        const crowned = reduce(ctxNoProbes, s, { type: 'crown', dishId: s.positives[0]!, source: 'direct' });
        expect(crowned.phase).toBe('match');
        expect(crowned.crownSource).toBe('direct');
        expect(crowned.runnerUpId).toBeNull();
    });

    it('the original positive persists through the extension (0 positives is unreachable)', () => {
        let s = directOfferState();
        const keeper = s.positives[0]!;
        s = reduce(ctxNoProbes, s, { type: 'extend' });
        while (s.phase === 'swiping') s = sw(ctxNoProbes, s, 'dislike');
        expect(s.positives).toEqual([keeper]);
    });

    it('superlike at the OMG cap throws (the driver bounces; no event is ever logged)', () => {
        let s = start(2);
        s = swipeMany(baseContext, s, ['superlike', 'superlike', 'superlike']);
        expect(s.omgUsed).toBe(3);
        expect(() => sw(baseContext, s, 'superlike')).toThrow(IllegalTransitionError);
        expect(sw(baseContext, s, 'like').phase).toBe('finalists');
    });

    it('end is legal from every live phase and reaches ended with nothing crowned', () => {
        for (const phase of ['swiping', 'probe', 'finalists', 'directOffer', 'historyFallback', 'bracket', 'match'] as Phase[]) {
            const ended = reduce(baseContext, stateIn(phase), { type: 'end' });
            expect(ended.phase).toBe('ended');
        }
    });

    it('sorted is legal only from match', () => {
        const saved = reduce(baseContext, stateIn('match'), { type: 'sorted' });
        expect(saved.phase).toBe('saved');
        expect(() => reduce(baseContext, saved, { type: 'sorted' })).toThrow(IllegalTransitionError);
    });

    it('dealer exhaustion (small pool) hard-stops with the current positive as directOffer', () => {
        const smallDeck = deck.filter((d) => d.modes.includes('takeaway')).slice(0, 10);
        const ctxSmall: EngineContext = createEngineContext(smallDeck, defaultTuning);
        let s = sw(ctxSmall, start(2, ctxSmall), 'like');
        while (s.phase === 'swiping') s = sw(ctxSmall, s, 'dislike');
        expect(s.phase).toBe('directOffer');
        expect(s.hardStopReason).toBe('exhausted');
        expect(s.cardsDealt).toBe(10);
        // Extending into an exhausted pool is not offered, and if forced returns straight back.
        expect(extensionAvailable(ctxSmall, s)).toBe(false);
        const bounced = reduce(ctxSmall, s, { type: 'extend' });
        expect(bounced.phase).toBe('directOffer');
        expect(bounced.extension.used).toBe(true);
    });
});

describe('historyFallback', () => {
    it('offers up to 3 past champions for the mode and crowns with source history', () => {
        const champs = deck.filter((d) => d.modes.includes('takeaway')).slice(0, 3).map((d) => d.id);
        let s = start(2, ctxNoProbes, {
            dealerContext: { recentChampions: [], lastSessionShownIds: [], historyChampionIds: champs },
        });
        while (s.phase === 'swiping') s = sw(ctxNoProbes, s, 'dislike');
        expect(s.phase).toBe('historyFallback');
        const crowned = reduce(ctxNoProbes, s, { type: 'crown', dishId: champs[1]!, source: 'history' });
        expect(crowned.phase).toBe('match');
        expect(crowned.crownSource).toBe('history');
        expect(crowned.runnerUpId).toBeNull();
    });

    it('rejects crowning a dish that was never offered', () => {
        const s = stateIn('historyFallback');
        expect(() => reduce(baseContext, s, { type: 'crown', dishId: 'chicken-pad-thai', source: 'history' }))
            .toThrow(IllegalTransitionError);
    });
});
