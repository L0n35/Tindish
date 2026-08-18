import { describe, expect, it } from 'vitest';
import { reduce, IllegalTransitionError } from '#shared/session/reducer';
import { canUndo } from '#shared/session/selectors';
import { baseContext as ctx, dislikeUntil, showProbe, start, sw, swipeMany } from '../../helpers/session';

describe('undo', () => {
    it('deep-equals the exact pre-swipe state (weights, streak, positives, cardsDealt, decisionIndex, currentCard)', () => {
        let s = swipeMany(ctx, start(2), ['like', 'dislike']);
        const before = { ...s, undo: null };
        const swiped = sw(ctx, s, 'superlike');
        const undone = reduce(ctx, swiped, { type: 'undo' });
        expect(undone).toEqual(before);
    });

    it('is one level: a second consecutive undo throws', () => {
        let s = sw(ctx, start(2), 'like');
        s = reduce(ctx, s, { type: 'undo' });
        expect(() => reduce(ctx, s, { type: 'undo' })).toThrow(IllegalTransitionError);
    });

    it('undo at the finalists reveal returns to swiping with the undone card back on top', () => {
        let s = swipeMany(ctx, start(2), ['like', 'like', 'like']);
        const fourthCard = s.currentCard!;
        s = sw(ctx, s, 'like');
        expect(s.phase).toBe('finalists');
        expect(canUndo(s)).toBe(true);
        const undone = reduce(ctx, s, { type: 'undo' });
        expect(undone.phase).toBe('swiping');
        expect(undone.currentCard).toBe(fourthCard);
        expect(undone.positives).toHaveLength(3);
        expect(undone.finalists).toBeNull();
        expect(undone.bracket).toBeNull();
    });

    it('the first bracketPick kills undo permanently', () => {
        let s = swipeMany(ctx, start(2), ['like', 'like', 'like', 'like']);
        const match = s.bracket!.matches[0]!;
        s = reduce(ctx, s, { type: 'bracketPick', matchIndex: 0, winnerId: match.a! });
        expect(s.phase).toBe('bracket');
        expect(s.undo).toBeNull();
        expect(() => reduce(ctx, s, { type: 'undo' })).toThrow(IllegalTransitionError);
    });

    it('undoing a superlike refunds the OMG cap', () => {
        let s = swipeMany(ctx, start(2), ['superlike', 'superlike', 'superlike']);
        expect(s.omgUsed).toBe(3);
        s = reduce(ctx, s, { type: 'undo' });
        expect(s.omgUsed).toBe(2);
        expect(() => sw(ctx, s, 'superlike')).not.toThrow();
    });

    it('probe events null the undo slot (nothing to undo inside or after a probe)', () => {
        let s = dislikeUntil(ctx, start(2), (x) => x.phase === 'probe');
        expect(s.undo).toBeNull();
        s = showProbe(ctx, s);
        expect(s.undo).toBeNull();
        s = reduce(ctx, s, { type: 'probePick', dishId: s.probe!.dishIds![0]! });
        expect(s.phase).toBe('swiping');
        expect(s.undo).toBeNull();
        expect(() => reduce(ctx, s, { type: 'undo' })).toThrow(IllegalTransitionError);
    });

    it('swipe → undo → same swipe yields a deal sequence identical to never having undone', () => {
        const straight = swipeMany(ctx, start(2), ['like', 'dislike', 'like', 'dislike']);
        let detour = swipeMany(ctx, start(2), ['like', 'dislike']);
        detour = sw(ctx, detour, 'like');
        detour = reduce(ctx, detour, { type: 'undo' });
        detour = swipeMany(ctx, detour, ['like', 'dislike']);
        expect(detour.dealtIds).toEqual(straight.dealtIds);
        expect(detour.currentCard).toBe(straight.currentCard);
        expect({ ...detour, undo: null }).toEqual({ ...straight, undo: null });
    });
});
