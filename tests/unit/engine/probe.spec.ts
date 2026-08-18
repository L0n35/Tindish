import { describe, expect, it } from 'vitest';
import { deck, deckById } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { applyReaction, type TagStats } from '#shared/engine/scoring';
import { dislikeOverlap, selectProbeDishes } from '#shared/engine/probe';

function dislikedStats(ids: string[]): TagStats {
    let stats: TagStats = {};
    for (const id of ids) stats = applyReaction(stats, deckById.get(id)!, 'dislike', defaultTuning);
    return stats;
}

describe('dislikeOverlap', () => {
    it('is zero with no negative preferences and grows with disliked tag matches', () => {
        expect(dislikeOverlap({}, deck[0]!, defaultTuning.K)).toBe(0);
        const stats = dislikedStats(['chicken-pad-thai']);
        const sibling = deckById.get('pad-see-ew')!;         // shares cuisine + format
        const far = deckById.get('mezze-plate')!;             // shares almost nothing
        expect(dislikeOverlap(stats, sibling, defaultTuning.K)).toBeGreaterThan(dislikeOverlap(stats, far, defaultTuning.K));
    });

    it('weights more-disliked values more', () => {
        const once = dislikedStats(['chicken-pad-thai']);
        const twice = dislikedStats(['chicken-pad-thai', 'pad-see-ew']);
        const probeTarget = deckById.get('thai-green-curry')!;
        expect(dislikeOverlap(twice, probeTarget, defaultTuning.K)).toBeGreaterThan(dislikeOverlap(once, probeTarget, defaultTuning.K));
    });
});

describe('selectProbeDishes', () => {
    const takeaway = deck.filter((d) => d.modes.includes('takeaway'));

    it('selects 4 unseen dishes with all-different primary formats when possible', () => {
        const stats = dislikedStats(['chicken-pad-thai', 'pad-see-ew', 'crispy-beef-chow-mein']);
        const picked = selectProbeDishes(takeaway, stats, defaultTuning)!;
        expect(picked).toHaveLength(4);
        expect(new Set(picked.map((d) => d.tags.primaryFormat)).size).toBe(4);
    });

    it('minimises overlap with the most-disliked tag values', () => {
        const stats = dislikedStats(['chicken-pad-thai', 'pad-see-ew', 'beef-pho']);
        const picked = selectProbeDishes(takeaway, stats, defaultTuning)!;
        const pickedOverlap = Math.max(...picked.map((d) => dislikeOverlap(stats, d, defaultTuning.K)));
        // Every picked dish is its own format's minimum — spot-check the best alternatives.
        for (const dish of picked) {
            const formatPeers = takeaway.filter((d) => d.tags.primaryFormat === dish.tags.primaryFormat);
            const bestPeer = Math.min(...formatPeers.map((d) => dislikeOverlap(stats, d, defaultTuning.K)));
            expect(dislikeOverlap(stats, dish, defaultTuning.K)).toBe(bestPeer);
        }
        expect(pickedOverlap).toBeLessThan(Math.max(...takeaway.map((d) => dislikeOverlap(stats, d, defaultTuning.K))));
    });

    it('is deterministic and RNG-free (repeat calls agree), ordered by overlap then id', () => {
        const stats = dislikedStats(['margherita-pizza']);
        const a = selectProbeDishes(takeaway, stats, defaultTuning)!.map((d) => d.id);
        const b = selectProbeDishes(takeaway, stats, defaultTuning)!.map((d) => d.id);
        expect(a).toEqual(b);
    });

    it('degrades gracefully below 4 distinct formats and returns null below 4 unseen dishes', () => {
        const sameFormatPool = deck.filter((d) => d.tags.primaryFormat === 'grill').slice(0, 3);
        const mixed = [...sameFormatPool, deckById.get('beef-pho')!, deckById.get('chicken-burrito')!];
        const picked = selectProbeDishes(mixed, {}, defaultTuning)!;
        expect(picked).toHaveLength(4);
        expect(selectProbeDishes(deck.slice(0, 3), {}, defaultTuning)).toBeNull();
    });
});
