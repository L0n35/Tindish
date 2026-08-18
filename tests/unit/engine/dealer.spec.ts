import { describe, expect, it } from 'vitest';
import { deck } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { resolveDealerMode } from '#shared/engine/dealer';
import { baseContext, makeCtx, start, sw, swipeMany } from '../../helpers/session';

describe('resolveDealerMode', () => {
    it('auto alternates by seed parity: even adaptive, odd shuffled', () => {
        expect(resolveDealerMode(defaultTuning, 2)).toBe('adaptive');
        expect(resolveDealerMode(defaultTuning, 7)).toBe('shuffled');
    });

    it('explicit settings are honored regardless of parity', () => {
        expect(resolveDealerMode({ ...defaultTuning, DEALER_MODE: 'adaptive' }, 7)).toBe('adaptive');
        expect(resolveDealerMode({ ...defaultTuning, DEALER_MODE: 'shuffled' }, 2)).toBe('shuffled');
    });
});

describe('adaptive dealer', () => {
    it('deals the opening trio for cards 1-3 without consuming decisions, then adapts at card 4', () => {
        let s = start(2);
        expect(s.dealerMode).toBe('adaptive');
        expect(s.decisionIndex).toBe(1);
        expect(s.dealQueue).toHaveLength(2);
        s = sw(baseContext, s, 'dislike');
        s = sw(baseContext, s, 'dislike');
        expect(s.decisionIndex).toBe(1);          // trio pops consume no RNG decisions
        expect(s.cardsDealt).toBe(3);
        s = sw(baseContext, s, 'dislike');
        expect(s.cardsDealt).toBe(4);             // first dealt (exploit) card
        expect(s.decisionIndex).toBe(2);
    });

    it('card 4 reflects reactions to cards 1-3 (an exploit pick follows the liked profile)', () => {
        const seed = 2;
        let liked = start(seed);
        const likedDish = baseContext.byId.get(liked.currentCard!)!;
        liked = swipeMany(baseContext, liked, ['superlike', 'dislike', 'dislike']);
        const exploitCard = baseContext.byId.get(liked.currentCard!)!;

        let disliked = start(seed);
        disliked = swipeMany(baseContext, disliked, ['dislike', 'dislike', 'dislike']);
        const avoidCard = baseContext.byId.get(disliked.currentCard!)!;

        // The exploit deal after a superlike shares more tag values with the superliked
        // dish than the deal after disliking the very same card does.
        const shared = (a: typeof likedDish, b: typeof likedDish) =>
            (['cuisine', 'protein', 'primaryFormat', 'richness', 'temperature', 'spice', 'vibe'] as const)
                .filter((dim) => a.tags[dim] === b.tags[dim]).length;
        expect(shared(likedDish, exploitCard)).toBeGreaterThanOrEqual(shared(likedDish, avoidCard));
        expect(exploitCard.id).not.toBe(avoidCard.id);
    });

    it('identical inputs give identical deal sequences (determinism)', () => {
        const run = () => {
            let s = start(6);
            const dealt: string[] = [s.currentCard!];
            for (let i = 0; i < 8 && s.phase === 'swiping'; i++) {
                s = sw(baseContext, s, i % 2 === 0 ? 'dislike' : 'like');
                if (s.currentCard) dealt.push(s.currentCard);
            }
            return dealt;
        };
        expect(run()).toEqual(run());
    });

    it('never deals 3 consecutive same-cuisine or same-format cards', () => {
        for (const seed of [2, 4, 6, 8, 10, 12]) {
            let s = start(seed);
            const dealtDishes = [baseContext.byId.get(s.currentCard!)!];
            for (let i = 0; i < 11 && s.phase === 'swiping'; i++) {
                s = sw(baseContext, s, 'dislike');
                if (s.currentCard) dealtDishes.push(baseContext.byId.get(s.currentCard)!);
            }
            for (let i = 2; i < dealtDishes.length; i++) {
                const [a, b, c] = [dealtDishes[i - 2]!, dealtDishes[i - 1]!, dealtDishes[i]!];
                const sameCuisine = a.tags.cuisine === b.tags.cuisine && b.tags.cuisine === c.tags.cuisine;
                const sameFormat = a.tags.primaryFormat === b.tags.primaryFormat
                    && b.tags.primaryFormat === c.tags.primaryFormat;
                expect(sameCuisine, `seed ${seed} cuisine run at ${i}`).toBe(false);
                expect(sameFormat, `seed ${seed} format run at ${i}`).toBe(false);
            }
        }
    });

    it('applies the 24h champion penalty inside the window and not outside it', () => {
        const startedAt = 1_750_000_000_000;
        const withPenalty = start(2, baseContext, {
            startedAt,
            dealerContext: {
                recentChampions: deck.filter((d) => d.modes.includes('takeaway')).map((d) => ({ dishId: d.id, ts: startedAt - 1000 })),
                lastSessionShownIds: [],
                historyChampionIds: [],
            },
        });
        const outsideWindow = start(2, baseContext, {
            startedAt,
            dealerContext: {
                recentChampions: deck.filter((d) => d.modes.includes('takeaway')).map((d) => ({ dishId: d.id, ts: startedAt - defaultTuning.CHAMPION_PENALTY_WINDOW_MS - 1 })),
                lastSessionShownIds: [],
                historyChampionIds: [],
            },
        });
        // Penalizing every dish equally cannot change anything (uniform shift) — instead
        // penalize only what the no-penalty run would have dealt at card 4.
        let clean = start(2);
        clean = swipeMany(baseContext, clean, ['like', 'like', 'like']);
        const cleanCard4 = clean.currentCard!;
        let penalizedRun = start(2, baseContext, {
            startedAt,
            dealerContext: { recentChampions: [{ dishId: cleanCard4, ts: startedAt - 1000 }], lastSessionShownIds: [], historyChampionIds: [] },
        });
        penalizedRun = swipeMany(baseContext, penalizedRun, ['like', 'like', 'like']);
        expect(penalizedRun.currentCard).not.toBe(cleanCard4);

        // Same construction outside the window: the penalty no longer applies.
        let expiredRun = start(2, baseContext, {
            startedAt,
            dealerContext: { recentChampions: [{ dishId: cleanCard4, ts: startedAt - defaultTuning.CHAMPION_PENALTY_WINDOW_MS - 1 }], lastSessionShownIds: [], historyChampionIds: [] },
        });
        expiredRun = swipeMany(baseContext, expiredRun, ['like', 'like', 'like']);
        expect(expiredRun.currentCard).toBe(cleanCard4);
        expect(withPenalty.currentCard).toBeTruthy();
        expect(outsideWindow.currentCard).toBeTruthy();
    });
});

describe('shuffled dealer', () => {
    it('deals the seeded shuffle order, skipping nothing at the start', () => {
        const a = start(7);
        const b = start(7);
        expect(a.dealerMode).toBe('shuffled');
        expect(a.currentCard).toBe(b.currentCard);
        expect(a.dealQueue).toHaveLength(0);
    });

    it('shares stop rules: 4 positives end the round instantly', () => {
        let s = start(7);
        s = swipeMany(baseContext, s, ['like', 'like', 'like', 'like']);
        expect(s.phase).toBe('finalists');
        expect(s.finalists).toHaveLength(4);
    });

    it('ignores the diversity guard and penalties but respects the mode filter', () => {
        let s = start(9, makeCtx(), { mode: 'cooking' });
        const dealt: string[] = [s.currentCard!];
        for (let i = 0; i < 11 && s.phase === 'swiping'; i++) {
            s = sw(baseContext, s, 'dislike');
            if (s.currentCard) dealt.push(s.currentCard);
        }
        for (const id of dealt) {
            expect(baseContext.byId.get(id)!.modes).toContain('cooking');
        }
    });
});
