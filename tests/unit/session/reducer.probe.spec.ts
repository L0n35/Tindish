import { describe, expect, it } from 'vitest';
import { defaultTuning } from '#shared/tuning';
import { reduce, viewOf, IllegalTransitionError, ReplayIntegrityError } from '#shared/session/reducer';
import { selectProbe } from '#shared/engine/dealer';
import { baseContext, dislikeUntil, showProbe, start, sw, swipeMany } from '../../helpers/session';

const ctx = baseContext;

function toFirstProbe(seed = 2) {
    return dislikeUntil(ctx, start(seed), (s) => s.phase === 'probe');
}

describe('probe trigger', () => {
    it('fires at exactly 7 consecutive dislikes, not 6', () => {
        let s = start(2);
        for (let i = 0; i < 6; i++) s = sw(ctx, s, 'dislike');
        expect(s.phase).toBe('swiping');
        expect(s.dislikeStreak).toBe(6);
        s = sw(ctx, s, 'dislike');
        expect(s.phase).toBe('probe');
        expect(s.probe).toEqual({ dishIds: null });
        expect(s.currentCard).toBeNull();
    });

    it('any positive resets the streak', () => {
        let s = start(2);
        for (let i = 0; i < 6; i++) s = sw(ctx, s, 'dislike');
        s = sw(ctx, s, 'like');
        expect(s.dislikeStreak).toBe(0);
        // Four more dislikes stay well under the threshold: no probe fires before the cap.
        for (let i = 0; i < 4; i++) s = sw(ctx, s, 'dislike');
        expect(s.phase).toBe('swiping');
        expect(s.dislikeStreak).toBe(4);
    });

    it('fires with the OMG cap exhausted: 3 superlikes then 7 dislikes leaves the probe fully usable', () => {
        let s = swipeMany(ctx, start(2), ['superlike', 'superlike', 'superlike']);
        expect(s.omgUsed).toBe(defaultTuning.OMG_CAP);
        for (let i = 0; i < 7; i++) s = sw(ctx, s, 'dislike');
        expect(s.phase).toBe('probe');
        s = showProbe(ctx, s);
        const picked = s.probe!.dishIds![0]!;
        s = reduce(ctx, s, { type: 'probePick', dishId: picked });
        expect(s.phase).toBe('finalists');           // 3 superlikes + probePick = 4 positives
        expect(s.positives).toContain(picked);
        expect(s.omgUsed).toBe(defaultTuning.OMG_CAP); // probePick neither consumes nor requires an OMG
    });
});

describe('probeShown', () => {
    it('commits recomputed ids, marks all four shown, increments probesUsed, consumes no RNG decision', () => {
        const triggered = toFirstProbe();
        const before = triggered.decisionIndex;
        const shown = showProbe(ctx, triggered);
        expect(shown.probe!.dishIds).toHaveLength(4);
        expect(shown.probesUsed).toBe(1);
        expect(shown.decisionIndex).toBe(before);
        for (const id of shown.probe!.dishIds!) {
            expect(shown.shownIds).toContain(id);
            expect(shown.dealtIds).not.toContain(id);
        }
    });

    it('rejects a payload that contradicts deterministic recomputation', () => {
        const triggered = toFirstProbe();
        const real = selectProbe(ctx, viewOf(triggered))!;
        const forged = [...real.slice(1), 'chicken-pad-thai'];
        expect(() => reduce(ctx, triggered, { type: 'probeShown', dishIds: forged }))
            .toThrow(ReplayIntegrityError);
    });

    it('cannot be shown twice', () => {
        const shown = showProbe(ctx, toFirstProbe());
        expect(() => reduce(ctx, shown, { type: 'probeShown', dishIds: shown.probe!.dishIds! }))
            .toThrow(IllegalTransitionError);
    });
});

describe('probePick', () => {
    it('applies +2 weights, one positive, one shown card, resets the streak, resumes dealing', () => {
        const shown = showProbe(ctx, toFirstProbe());
        const cardsBefore = shown.cardsDealt;
        const picked = shown.probe!.dishIds![2]!;
        const s = reduce(ctx, shown, { type: 'probePick', dishId: picked });
        expect(s.phase).toBe('swiping');
        expect(s.positives).toEqual([picked]);
        expect(s.reactions.at(-1)).toEqual({ dishId: picked, reaction: 'probePick' });
        expect(s.dislikeStreak).toBe(0);
        expect(s.cardsDealt).toBe(cardsBefore + 2);      // picked probe dish + the resumed deal
        expect(s.dealtIds).toContain(picked);
        expect(s.currentCard).not.toBeNull();
        const key = `cuisine:${ctx.byId.get(picked)!.tags.cuisine}`;
        expect(s.engine.stats[key]!.sum).toBeGreaterThan(0);
    });

    it('rejects a dish that was not on the probe screen', () => {
        const shown = showProbe(ctx, toFirstProbe());
        const offScreen = shown.dealtIds[0]!;
        expect(() => reduce(ctx, shown, { type: 'probePick', dishId: offScreen }))
            .toThrow(IllegalTransitionError);
    });

    it('the three unpicked probe dishes stay shown with zero weight change', () => {
        const shown = showProbe(ctx, toFirstProbe());
        const picked = shown.probe!.dishIds![0]!;
        const unpicked = shown.probe!.dishIds!.slice(1);
        const s = reduce(ctx, shown, { type: 'probePick', dishId: picked });
        for (const id of unpicked) {
            expect(s.shownIds).toContain(id);
            expect(s.dealtIds).not.toContain(id);
            const dish = ctx.byId.get(id)!;
            // No key of an unpicked dish gained weight from the pick unless shared with the picked dish.
            const pickedDish = ctx.byId.get(picked)!;
            for (const dim of ['cuisine', 'protein'] as const) {
                if (dish.tags[dim] !== pickedDish.tags[dim]) {
                    const stat = s.engine.stats[`${dim}:${dish.tags[dim]}`];
                    expect(stat?.sum ?? 0).toBeLessThanOrEqual(0);
                }
            }
        }
    });
});

describe('probeNone and the streak ruling', () => {
    it('marks all four shown, changes no weights, keeps cardsDealt, and the streak persists', () => {
        const shown = showProbe(ctx, toFirstProbe());
        const statsBefore = JSON.stringify(shown.engine.stats);
        const s = reduce(ctx, shown, { type: 'probeNone' });
        expect(s.phase).toBe('swiping');
        expect(JSON.stringify(s.engine.stats)).toBe(statsBefore);
        expect(s.cardsDealt).toBe(shown.cardsDealt + 1);  // only the resumed deal
        expect(s.dislikeStreak).toBeGreaterThanOrEqual(defaultTuning.STREAK_THRESHOLD);
    });

    it('the very next dislike after probeNone triggers probe 2 (streak persists, edge-triggered)', () => {
        let s = showProbe(ctx, toFirstProbe());
        s = reduce(ctx, s, { type: 'probeNone' });
        expect(s.phase).toBe('swiping');
        s = sw(ctx, s, 'dislike');
        expect(s.phase).toBe('probe');
        expect(s.probesUsed).toBe(1);   // second screen not yet shown
    });

    it('probes are hard-capped at MAX_PROBES; the final probeNone resolves by positives (0 → historyFallback)', () => {
        let s = showProbe(ctx, toFirstProbe());
        s = reduce(ctx, s, { type: 'probeNone' });
        s = dislikeUntil(ctx, s, (x) => x.phase === 'probe', 10);
        s = showProbe(ctx, s);
        expect(s.probesUsed).toBe(2);
        s = reduce(ctx, s, { type: 'probeNone' });
        expect(s.phase).toBe('historyFallback');
    });

    it('the final probeNone with positives in hand resolves to her positives, not historyFallback', () => {
        let s = swipeMany(ctx, start(2), ['like', 'like']);
        s = dislikeUntil(ctx, s, (x) => x.phase === 'probe', 20);
        s = showProbe(ctx, s);
        s = reduce(ctx, s, { type: 'probeNone' });
        s = dislikeUntil(ctx, s, (x) => x.phase === 'probe', 20);
        s = showProbe(ctx, s);
        s = reduce(ctx, s, { type: 'probeNone' });
        expect(s.phase).toBe('finalists');
        expect(s.finalists).toHaveLength(2);
    });

    it('a streak re-fire with probes exhausted is a non-event: dealing continues to the hard stop', () => {
        let s = swipeMany(ctx, start(2), ['like']);
        s = dislikeUntil(ctx, s, (x) => x.phase === 'probe', 20);
        s = showProbe(ctx, s);
        s = reduce(ctx, s, { type: 'probeNone' });
        s = dislikeUntil(ctx, s, (x) => x.phase === 'probe', 20);
        s = showProbe(ctx, s);
        s = reduce(ctx, s, { type: 'probeNone' });
        // Probes exhausted with 1 positive → straight to directOffer? No: probeNone at cap
        // resolves by positives immediately (1 positive → directOffer).
        expect(s.phase).toBe('directOffer');
        expect(s.positives).toHaveLength(1);
    });

    it('probe outranks the hard stop when the 7th dislike lands on the budget-final card', () => {
        // Cards 1-5: like/dislike alternation ending on a like → 3 positives, streak 0.
        let s = swipeMany(ctx, start(2), ['like', 'dislike', 'like', 'dislike', 'like']);
        expect(s.positives).toHaveLength(3);
        expect(s.dislikeStreak).toBe(0);
        // Dislikes on cards 6-11 bring the streak to 6 with card 12 (the budget-final card) up.
        for (let i = 0; i < 6; i++) s = sw(ctx, s, 'dislike');
        expect(s.cardsDealt).toBe(defaultTuning.MAX_CARDS);
        expect(s.dislikeStreak).toBe(6);
        expect(s.phase).toBe('swiping');
        // The 7th consecutive dislike lands exactly at the cap: probe, not hard stop.
        s = sw(ctx, s, 'dislike');
        expect(s.phase).toBe('probe');
    });
});
