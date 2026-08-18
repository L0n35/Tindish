import type { Dish } from '../types/dish';
import type { Tuning } from '../tuning';
import { tagValuesOf } from './tags';

export type Reaction = 'like' | 'dislike' | 'superlike' | 'probePick';

export interface TagStat {
    count: number;
    sum: number;
}

export type TagStats = Readonly<Record<string, TagStat>>;

export const emptyStats: TagStats = Object.freeze({});

export function applyReaction(stats: TagStats, dish: Dish, reaction: Reaction, tuning: Tuning): TagStats {
    const weight = tuning.reactionWeights[reaction];
    const next: Record<string, TagStat> = { ...stats };
    for (const key of tagValuesOf(dish)) {
        const prev = next[key] ?? { count: 0, sum: 0 };
        next[key] = { count: prev.count + 1, sum: prev.sum + weight };
    }
    return next;
}

export function preference(stats: TagStats, key: string, k: number): number {
    const stat = stats[key];
    return (stat?.sum ?? 0) / ((stat?.count ?? 0) + k);
}

export function predictedScore(stats: TagStats, dish: Dish, tuning: Tuning): number {
    const keys = tagValuesOf(dish);
    let total = 0;
    for (const key of keys) total += preference(stats, key, tuning.K);
    return total / keys.length;
}

export function underObservation(stats: TagStats, dish: Dish): number {
    const keys = tagValuesOf(dish);
    let total = 0;
    for (const key of keys) total += 1 / Math.sqrt((stats[key]?.count ?? 0) + 1);
    return total / keys.length;
}
