import type { Dish, Mode } from '../types/dish';
import type { EffortFilter } from '../types/session';
import type { Tuning } from '../tuning';

export interface SoftPenaltyContext {
    champion24hIds: ReadonlySet<string>;
    lastSessionShownIds: ReadonlySet<string>;
}

// 0 = all constraints; 1 = diversity guard dropped; 2 = + last-session penalty dropped;
// 3 = + 24h champion penalty dropped. Rungs 2–3 are faithful score-toggles — penalties are
// soft, so only rung 1 can restore candidacy; rungs 2–3 observably alter tie-breaks.
export type RelaxationLevel = 0 | 1 | 2 | 3;

export function filterCandidates(deck: readonly Dish[], opts: {
    mode: Mode;
    effortFilter: EffortFilter;
    excludeIds: ReadonlySet<string>;
}): Dish[] {
    return deck
        .filter((dish) => dish.modes.includes(opts.mode))
        .filter((dish) => opts.mode !== 'cooking' || opts.effortFilter !== 'quick' || dish.tags.effort === 'quick')
        .filter((dish) => !opts.excludeIds.has(dish.id))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function violatesDiversityGuard(candidate: Dish, recentDeals: readonly Dish[], tuning: Tuning): boolean {
    const window = recentDeals.slice(-tuning.DIVERSITY_WINDOW);
    if (window.length < tuning.DIVERSITY_WINDOW) return false;
    const sameCuisine = window.every((d) => d.tags.cuisine === candidate.tags.cuisine);
    const sameFormat = window.every((d) => d.tags.primaryFormat === candidate.tags.primaryFormat);
    return sameCuisine || sameFormat;
}

export function penaltyFor(dishId: string, ctx: SoftPenaltyContext, tuning: Tuning, level: RelaxationLevel): number {
    let penalty = 0;
    if (level < 2 && ctx.lastSessionShownIds.has(dishId)) penalty += tuning.LAST_SESSION_SHOWN_PENALTY;
    if (level < 3 && ctx.champion24hIds.has(dishId)) penalty += tuning.CHAMPION_24H_PENALTY;
    return penalty;
}

export type CandidateResolution =
    | { candidates: Dish[]; level: RelaxationLevel }
    | { exhausted: true };

export function resolveCandidates(args: {
    deck: readonly Dish[];
    mode: Mode;
    effortFilter: EffortFilter;
    excludeIds: ReadonlySet<string>;
    recentDeals: readonly Dish[];
    tuning: Tuning;
}): CandidateResolution {
    const base = filterCandidates(args.deck, args);
    if (base.length === 0) return { exhausted: true };
    const guarded = base.filter((d) => !violatesDiversityGuard(d, args.recentDeals, args.tuning));
    if (guarded.length > 0) return { candidates: guarded, level: 0 };
    return { candidates: base, level: 1 };
}
