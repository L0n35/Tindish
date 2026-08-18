import { describe, expect, it } from 'vitest';
import { deck } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { deriveRng } from '#shared/engine/rng';
import { tagDistance } from '#shared/engine/tags';
import { selectOpeningTrio } from '#shared/engine/openingTrio';
import { dealKindForPosition } from '#shared/engine/schedule';
import type { Dish } from '#shared/types/dish';

const noPenalties = { champion24hIds: new Set<string>(), lastSessionShownIds: new Set<string>() };
const smallPool: Dish[] = deck.slice(0, 12);

function minPairwise(trio: readonly Dish[]): number {
    return Math.min(
        tagDistance(trio[0]!, trio[1]!),
        tagDistance(trio[0]!, trio[2]!),
        tagDistance(trio[1]!, trio[2]!),
    );
}

describe('opening trio', () => {
    it('matches brute force max-min pairwise distance on a 12-dish pool', () => {
        const picked = selectOpeningTrio(smallPool, noPenalties, defaultTuning, deriveRng(1, 0));
        let best = -1;
        for (let i = 0; i < smallPool.length - 2; i++) {
            for (let j = i + 1; j < smallPool.length - 1; j++) {
                for (let k = j + 1; k < smallPool.length; k++) {
                    best = Math.max(best, minPairwise([smallPool[i]!, smallPool[j]!, smallPool[k]!]));
                }
            }
        }
        expect(minPairwise(picked)).toBe(best);
    });

    it('same seed gives the same trio; the trio deals in ascending id order', () => {
        const a = selectOpeningTrio(deck, noPenalties, defaultTuning, deriveRng(5, 0));
        const b = selectOpeningTrio(deck, noPenalties, defaultTuning, deriveRng(5, 0));
        expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
        expect([...a].sort((x, y) => (x.id < y.id ? -1 : 1)).map((d) => d.id)).toEqual(a.map((d) => d.id));
    });

    it('penalized dishes lose distance ties for trio membership', () => {
        const unpenalized = selectOpeningTrio(smallPool, noPenalties, defaultTuning, deriveRng(2, 0));
        const target = unpenalized[0]!.id;
        const penalized = selectOpeningTrio(
            smallPool,
            { champion24hIds: new Set([target]), lastSessionShownIds: new Set<string>() },
            defaultTuning,
            deriveRng(2, 0),
        );
        const stillMax = minPairwise(penalized) === minPairwise(unpenalized);
        expect(stillMax).toBe(true);
        if (penalized.some((d) => d.id === target)) {
            // Only acceptable if every max-distance trio contains the penalized dish.
            let alternativesExist = false;
            for (let i = 0; i < smallPool.length - 2 && !alternativesExist; i++) {
                for (let j = i + 1; j < smallPool.length - 1 && !alternativesExist; j++) {
                    for (let k = j + 1; k < smallPool.length; k++) {
                        const trio = [smallPool[i]!, smallPool[j]!, smallPool[k]!];
                        if (minPairwise(trio) === minPairwise(unpenalized) && !trio.some((d) => d.id === target)) {
                            alternativesExist = true;
                            break;
                        }
                    }
                }
            }
            expect(alternativesExist).toBe(false);
        }
    });

    it('throws below 3 candidates', () => {
        expect(() => selectOpeningTrio(deck.slice(0, 2), noPenalties, defaultTuning, deriveRng(1, 0))).toThrow();
    });
});

describe('deal schedule', () => {
    it('cards 1-3 are the opening trio', () => {
        for (const position of [1, 2, 3]) {
            expect(dealKindForPosition(position, defaultTuning)).toBe('openingTrio');
        }
    });

    it('card 4 is the first exploit and card 7 the first explore', () => {
        expect(dealKindForPosition(4, defaultTuning)).toBe('exploit');
        expect(dealKindForPosition(5, defaultTuning)).toBe('exploit');
        expect(dealKindForPosition(6, defaultTuning)).toBe('exploit');
        expect(dealKindForPosition(7, defaultTuning)).toBe('explore');
    });

    it('the block repeats: 8-10 exploit, 11 explore, 12 exploit; extension continues it (explore at 15)', () => {
        expect(dealKindForPosition(8, defaultTuning)).toBe('exploit');
        expect(dealKindForPosition(9, defaultTuning)).toBe('exploit');
        expect(dealKindForPosition(10, defaultTuning)).toBe('exploit');
        expect(dealKindForPosition(11, defaultTuning)).toBe('explore');
        expect(dealKindForPosition(12, defaultTuning)).toBe('exploit');
        expect(dealKindForPosition(15, defaultTuning)).toBe('explore');
        expect(dealKindForPosition(19, defaultTuning)).toBe('explore');
    });
});
