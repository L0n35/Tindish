import { describe, expect, it } from 'vitest';
import { deck, deckById } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { applyReaction, predictedScore, preference, underObservation } from '#shared/engine/scoring';
import { tagKey, tagValuesOf, tagDistance } from '#shared/engine/tags';

const dish = deckById.get('chicken-pad-thai')!;
const other = deckById.get('salmon-poke-bowl')!;

describe('tags', () => {
    it('a dish exposes exactly 7 scored tag keys, never effort', () => {
        const keys = tagValuesOf(dish);
        expect(keys).toHaveLength(7);
        expect(keys.some((k) => k.startsWith('effort'))).toBe(false);
    });

    it('numeric tags become categorical keys', () => {
        expect(tagValuesOf(dish)).toContain(tagKey('spice', 1));
        expect(tagValuesOf(dish)).toContain(tagKey('richness', 2));
    });

    it('tagDistance counts differing dimensions over the 7 scored dims only', () => {
        expect(tagDistance(dish, dish)).toBe(0);
        const d = tagDistance(dish, other);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThanOrEqual(7);
    });
});

describe('applyReaction', () => {
    it('applies like +1 / superlike +2 / probePick +2 / dislike -1.5 to each of the 7 keys', () => {
        for (const [reaction, weight] of [['like', 1], ['superlike', 2], ['probePick', 2], ['dislike', -1.5]] as const) {
            const stats = applyReaction({}, dish, reaction, defaultTuning);
            for (const key of tagValuesOf(dish)) {
                expect(stats[key]).toEqual({ count: 1, sum: weight });
            }
        }
    });

    it('never mutates its input', () => {
        const stats = applyReaction({}, dish, 'like', defaultTuning);
        const frozen = JSON.stringify(stats);
        applyReaction(stats, other, 'dislike', defaultTuning);
        expect(JSON.stringify(stats)).toBe(frozen);
    });
});

describe('preference and predicted score', () => {
    it('preference is sum/(count+K)', () => {
        let stats = applyReaction({}, dish, 'like', defaultTuning);
        stats = applyReaction(stats, dish, 'like', defaultTuning);
        expect(preference(stats, tagValuesOf(dish)[0]!, defaultTuning.K)).toBeCloseTo(2 / 3);
    });

    it('an unobserved tag value scores 0 and under-observes at 1', () => {
        expect(preference({}, 'cuisine:nowhere', defaultTuning.K)).toBe(0);
        expect(underObservation({}, dish)).toBe(1);
    });

    it('predicted score is the mean of tag-value preferences', () => {
        const stats = applyReaction({}, dish, 'like', defaultTuning);
        expect(predictedScore(stats, dish, defaultTuning)).toBeCloseTo(0.5);
        expect(predictedScore(stats, other, defaultTuning)).toBeLessThan(0.5);
    });

    it('under-observation is mean 1/sqrt(count+1) and decays with observations', () => {
        let stats = applyReaction({}, dish, 'dislike', defaultTuning);
        const afterOne = underObservation(stats, dish);
        expect(afterOne).toBeCloseTo(1 / Math.sqrt(2));
        stats = applyReaction(stats, dish, 'dislike', defaultTuning);
        expect(underObservation(stats, dish)).toBeLessThan(afterOne);
    });

    it('a once-rejected cuisine stays explore-eligible through a different dish', () => {
        const rejectedPizza = deckById.get('margherita-pizza')!;
        const otherItalian = deckById.get('mushroom-risotto')!;
        const stats = applyReaction({}, rejectedPizza, 'dislike', defaultTuning);
        const fresh = deck.find((d) => d.tags.cuisine === 'thai')!;
        expect(underObservation(stats, otherItalian)).toBeGreaterThan(0.8);
        expect(underObservation(stats, otherItalian)).toBeLessThan(underObservation(stats, fresh));
    });
});
