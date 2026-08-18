import { describe, expect, it } from 'vitest';
import { deck } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { deriveRng } from '#shared/engine/rng';
import { replaySession, ReplayVersionMismatchError } from '#shared/session/replay';
import { previewNext } from '#shared/session/selectors';
import { baseContext as ctx, makeConfig, TestSession } from '../../helpers/session';
import type { SwipeReaction } from '#shared/types/session';

const reactionsPool: SwipeReaction[] = ['like', 'dislike', 'dislike', 'superlike', 'dislike', 'like'];

// Scripted pseudo-random agent that exercises swipes, probes, undo, extension, and bracket.
function runScriptedSession(seed: number, withPreviews: boolean) {
    const session = new TestSession(ctx, makeConfig(seed));
    const rng = deriveRng(seed ^ 0x5eed, 0);
    let undone = false;
    let guard = 0;
    while (guard++ < 120) {
        const s = session.state;
        if (s.phase === 'swiping') {
            if (withPreviews) {
                previewNext(ctx, s, 'dislike');
                previewNext(ctx, s, 'like');
                previewNext(ctx, s, 'superlike');
            }
            if (!undone && s.undo !== null && rng() < 0.15) {
                undone = true;
                session.dispatch({ type: 'undo' });
                continue;
            }
            let reaction = reactionsPool[Math.floor(rng() * reactionsPool.length)]!;
            if (reaction === 'superlike' && s.omgUsed >= defaultTuning.OMG_CAP) reaction = 'like';
            session.swipe(reaction);
        } else if (s.phase === 'probe') {
            if (s.probe!.dishIds === null) {
                session.showProbe();
            } else if (rng() < 0.5) {
                session.dispatch({ type: 'probePick', dishId: s.probe!.dishIds[Math.floor(rng() * 4)]! });
            } else {
                session.dispatch({ type: 'probeNone' });
            }
        } else if (s.phase === 'finalists' || s.phase === 'bracket') {
            const match = s.bracket!.matches[s.bracket!.currentMatchIndex]!;
            if (s.bracket!.complete) {
                session.dispatch({ type: 'crown', dishId: s.bracket!.championId!, source: 'bracket' });
            } else {
                session.dispatch({
                    type: 'bracketPick',
                    matchIndex: s.bracket!.currentMatchIndex,
                    winnerId: rng() < 0.5 ? match.a! : match.b!,
                });
            }
        } else if (s.phase === 'directOffer') {
            if (!s.extension.used && rng() < 0.6) session.dispatch({ type: 'extend' });
            else session.dispatch({ type: 'crown', dishId: s.positives[0]!, source: 'direct' });
        } else if (s.phase === 'historyFallback') {
            session.dispatch({ type: 'end' });
        } else if (s.phase === 'match') {
            if (s.runnerUpId !== null && !s.usedRunnerUp && rng() < 0.3) {
                session.dispatch({ type: 'crown', dishId: s.runnerUpId, source: 'bracket' });
            } else {
                session.dispatch({ type: 'sorted' });
            }
        } else {
            break; // saved / ended
        }
    }
    return session;
}

describe('replay determinism', () => {
    // 200 sessions over the full deck outgrew the default 5s timeout when the deck doubled.
    it('re-folding any session log yields a state deep-equal to the live state (200 seeded sessions)', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const live = runScriptedSession(seed, false);
            expect(['saved', 'ended'], `seed ${seed} terminated`).toContain(live.state.phase);
            const replayed = replaySession(live.envelope(), deck, defaultTuning);
            expect(replayed, `seed ${seed}`).toEqual(live.state);
        }
    }, 30_000);

    it('restores a mid-bracket envelope to the exact match position', () => {
        const session = new TestSession(ctx, makeConfig(2));
        session.swipe('like'); session.swipe('like'); session.swipe('like'); session.swipe('like');
        const match0 = session.state.bracket!.matches[0]!;
        session.dispatch({ type: 'bracketPick', matchIndex: 0, winnerId: match0.a! });
        const restored = replaySession(session.envelope(), deck, defaultTuning);
        expect(restored.phase).toBe('bracket');
        expect(restored.bracket!.currentMatchIndex).toBe(1);
        expect(restored.bracket!.matches[0]!.winnerId).toBe(match0.a);
    });

    it('restores a mid-probe envelope with identical probe dishIds', () => {
        const session = new TestSession(ctx, makeConfig(2));
        for (let i = 0; i < 7; i++) session.swipe('dislike');
        session.showProbe();
        const shownIds = session.state.probe!.dishIds!;
        const restored = replaySession(session.envelope(), deck, defaultTuning);
        expect(restored.phase).toBe('probe');
        expect(restored.probe!.dishIds).toEqual(shownIds);
    });

    it('throws ReplayVersionMismatchError for each version field', () => {
        const session = new TestSession(ctx, makeConfig(2));
        session.swipe('like');
        const env = session.envelope();
        expect(() => replaySession({ ...env, engineVersion: 999 }, deck, defaultTuning)).toThrow(ReplayVersionMismatchError);
        expect(() => replaySession({ ...env, deckHash: 'ffffffff' }, deck, defaultTuning)).toThrow(ReplayVersionMismatchError);
        expect(() => replaySession({ ...env, tuningVersion: 999 }, deck, defaultTuning)).toThrow(ReplayVersionMismatchError);
    });

    it('an envelope containing an illegal event sequence throws (corruption surfaces, never mis-restores)', () => {
        const session = new TestSession(ctx, makeConfig(2));
        session.swipe('like');
        const env = session.envelope();
        env.events.push({ type: 'sorted' });
        expect(() => replaySession(env, deck, defaultTuning)).toThrow();
    });
});

describe('preview purity and exactness', () => {
    it('running previews at every step never changes the dealt sequence (full-session A/B)', () => {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]) {
            const clean = runScriptedSession(seed, false);
            const previewed = runScriptedSession(seed, true);
            expect(previewed.state.dealtIds, `seed ${seed}`).toEqual(clean.state.dealtIds);
            expect(previewed.state, `seed ${seed}`).toEqual(clean.state);
        }
    });

    it('previewNext exactly predicts the real next card for every branch, every step', () => {
        for (const seed of [2, 4, 6, 7, 9, 11]) {
            const session = new TestSession(ctx, makeConfig(seed));
            const rng = deriveRng(seed, 999);
            let guard = 0;
            while (session.state.phase === 'swiping' && guard++ < 20) {
                const s = session.state;
                const reactions: SwipeReaction[] = ['dislike', 'like', 'superlike'];
                const previews = reactions.map((r) => previewNext(ctx, s, r));
                const chosen = reactions[Math.floor(rng() * 3)]!;
                const predicted = previews[reactions.indexOf(chosen)]!;
                if (predicted.kind === 'bounce') continue;
                session.swipe(chosen);
                const after = session.state;
                if (predicted.kind === 'card') {
                    expect(after.phase, `seed ${seed}`).toBe('swiping');
                    expect(after.currentCard, `seed ${seed}`).toBe(predicted.dishId);
                } else {
                    expect(after.phase, `seed ${seed}`).toBe(predicted.kind === 'probe' ? 'probe' : predicted.kind);
                }
            }
        }
    });

    it('previewNext returns bounce for a superlike at the OMG cap', () => {
        const session = new TestSession(ctx, makeConfig(2));
        session.swipe('superlike'); session.swipe('superlike'); session.swipe('superlike');
        expect(previewNext(ctx, session.state, 'superlike')).toEqual({ kind: 'bounce' });
    });
});
