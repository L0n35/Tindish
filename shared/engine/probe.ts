import type { Dish } from '../types/dish';
import type { Tuning } from '../tuning';
import { preference, type TagStats } from './scoring';
import { tagValuesOf } from './tags';

// How strongly this dish overlaps her most-disliked tag values: the sum, over the dish's
// scored tag keys, of the magnitude of any negative preference on that key.
export function dislikeOverlap(stats: TagStats, dish: Dish, k: number): number {
    let overlap = 0;
    for (const key of tagValuesOf(dish)) {
        overlap += Math.max(0, -preference(stats, key, k));
    }
    return overlap;
}

// Deterministic and RNG-free (probeShown replays bit-identically): group unseen dishes by
// primaryFormat, take each format's lowest-overlap representative, then the PROBE_SIZE
// lowest-overlap representatives. Fewer than PROBE_SIZE formats degrades gracefully by
// filling with the lowest-overlap remaining dishes; fewer than PROBE_SIZE unseen dishes
// means no probe is available (returns null). Screen order: ascending overlap, then id.
export function selectProbeDishes(unseen: readonly Dish[], stats: TagStats, tuning: Tuning): Dish[] | null {
    if (unseen.length < tuning.PROBE_SIZE) return null;

    const overlapOf = new Map<string, number>();
    for (const dish of unseen) overlapOf.set(dish.id, dislikeOverlap(stats, dish, tuning.K));
    const byOverlapThenId = (a: Dish, b: Dish): number => {
        const diff = overlapOf.get(a.id)! - overlapOf.get(b.id)!;
        if (diff !== 0) return diff;
        return a.id < b.id ? -1 : 1;
    };

    const representatives = new Map<string, Dish>();
    for (const dish of [...unseen].sort(byOverlapThenId)) {
        if (!representatives.has(dish.tags.primaryFormat)) representatives.set(dish.tags.primaryFormat, dish);
    }

    const picked = [...representatives.values()].sort(byOverlapThenId).slice(0, tuning.PROBE_SIZE);
    if (picked.length < tuning.PROBE_SIZE) {
        const chosen = new Set(picked.map((d) => d.id));
        for (const dish of [...unseen].sort(byOverlapThenId)) {
            if (picked.length >= tuning.PROBE_SIZE) break;
            if (!chosen.has(dish.id)) {
                picked.push(dish);
                chosen.add(dish.id);
            }
        }
    }
    return picked.sort(byOverlapThenId);
}
