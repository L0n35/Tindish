import { describe, expect, it } from 'vitest';
import { deck } from '#shared/data/deck';
import { gradientFor } from '../../app/utils/gradientFallback';

describe('gradient fallback art', () => {
    it('is deterministic: same id → same css', () => {
        expect(gradientFor('chicken-pad-thai')).toBe(gradientFor('chicken-pad-thai'));
    });

    it('keeps hue pairs 40-120 degrees apart (a real gradient, never flat)', () => {
        for (const dish of deck) {
            const css = gradientFor(dish.id);
            const hues = [...css.matchAll(/hsl\((\d+)/g)].map((m) => Number(m[1]));
            expect(hues).toHaveLength(2);
            const gap = Math.abs(hues[0]! - hues[1]!);
            const circular = Math.min(gap, 360 - gap);
            expect(circular, dish.id).toBeGreaterThanOrEqual(40);
            expect(circular, dish.id).toBeLessThanOrEqual(120);
        }
    });

    it('distinct ids produce mostly distinct gradients across the deck', () => {
        const unique = new Set(deck.map((d) => gradientFor(d.id)));
        expect(unique.size).toBeGreaterThanOrEqual(deck.length - 2);
    });
});
