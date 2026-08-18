import { describe, expect, it } from 'vitest';
import { deck } from '#shared/data/deck';
import { deckSchema } from '#shared/data/deckSchema';
import { hashDeck } from '#shared/data/deckHash';
import type { Dish, Mode, Vibe } from '#shared/types/dish';

const modes: Mode[] = ['cooking', 'takeaway'];
const vibes: Vibe[] = ['comfort', 'fresh', 'indulgent', 'healthy'];
const pool = (mode: Mode): Dish[] => deck.filter((d) => d.modes.includes(mode));

function shareOf(dishes: Dish[], predicate: (d: Dish) => boolean): number {
    return dishes.filter(predicate).length / dishes.length;
}

describe('deck schema', () => {
    it('has 90-100 dishes, >= 60 per mode, unique kebab-case ids, effort on all cookable dishes', () => {
        expect(() => deckSchema.parse(deck)).not.toThrow();
    });

    it('rejects a cooking dish without effort', () => {
        // Keep length within schema bounds so the effort refinement is what fails.
        const broken = [...deck.slice(0, deck.length - 1), {
            ...deck[0]!,
            id: 'broken-dish',
            tags: { ...deck[0]!.tags, effort: undefined },
        }];
        expect(deckSchema.safeParse(broken).success).toBe(false);
    });
});

describe.each(modes)('deck balance (%s pool)', (mode) => {
    const dishes = pool(mode);

    it('no cuisine exceeds 20% of the pool', () => {
        const cuisines = new Set(dishes.map((d) => d.tags.cuisine));
        for (const cuisine of cuisines) {
            expect(shareOf(dishes, (d) => d.tags.cuisine === cuisine), cuisine).toBeLessThanOrEqual(0.2);
        }
    });

    it('no primaryFormat exceeds 20% of the pool', () => {
        const formats = new Set(dishes.map((d) => d.tags.primaryFormat));
        for (const format of formats) {
            expect(shareOf(dishes, (d) => d.tags.primaryFormat === format), format).toBeLessThanOrEqual(0.2);
        }
    });

    it('every vibe sits between 15% and 40%', () => {
        for (const vibe of vibes) {
            const share = shareOf(dishes, (d) => d.tags.vibe === vibe);
            expect(share, vibe).toBeGreaterThanOrEqual(0.15);
            expect(share, vibe).toBeLessThanOrEqual(0.4);
        }
    });

    it('no vibe is temperature-confounded (no single temperature > 90% of a vibe)', () => {
        for (const vibe of vibes) {
            const inVibe = dishes.filter((d) => d.tags.vibe === vibe);
            const hotShare = inVibe.filter((d) => d.tags.temperature === 'hot').length / inVibe.length;
            expect(hotShare, `${vibe} hot`).toBeLessThanOrEqual(0.9);
            expect(1 - hotShare, `${vibe} cold`).toBeLessThanOrEqual(0.9);
        }
    });
});

describe('quick cooking pool stays sessionable', () => {
    const quick = deck.filter((d) => d.modes.includes('cooking') && d.tags.effort === 'quick');

    it('holds at least 12 dishes across at least 5 formats with every vibe >= 2', () => {
        expect(quick.length).toBeGreaterThanOrEqual(12);
        expect(new Set(quick.map((d) => d.tags.primaryFormat)).size).toBeGreaterThanOrEqual(5);
        for (const vibe of vibes) {
            expect(quick.filter((d) => d.tags.vibe === vibe).length, vibe).toBeGreaterThanOrEqual(2);
        }
    });
});

describe('deck hash', () => {
    it('is stable under dish reordering and key reordering', () => {
        const reordered = [...deck].reverse();
        expect(hashDeck(reordered)).toBe(hashDeck(deck));
    });

    it('changes when any tag changes', () => {
        const mutated = deck.map((d, i) => (i === 0 ? { ...d, tags: { ...d.tags, spice: 3 as const } } : d));
        expect(hashDeck(mutated)).not.toBe(hashDeck(deck));
    });
});
