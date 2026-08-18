import { SCORED_DIMENSIONS, type Dish, type ScoredDimension } from '../types/dish';

export function tagKey(dim: ScoredDimension, value: string | number): string {
    return `${dim}:${value}`;
}

export function tagValuesOf(dish: Dish): string[] {
    return SCORED_DIMENSIONS.map((dim) => tagKey(dim, dish.tags[dim]));
}

export function tagDistance(a: Dish, b: Dish): number {
    let d = 0;
    for (const dim of SCORED_DIMENSIONS) {
        if (a.tags[dim] !== b.tags[dim]) d++;
    }
    return d;
}
