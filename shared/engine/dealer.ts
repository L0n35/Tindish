import type { Dish, Mode } from '../types/dish';
import type { DealerContext, DealerMode, EffortFilter } from '../types/session';
import type { Tuning } from '../tuning';
import { deriveRng, shuffle, type Rng } from './rng';
import { predictedScore, underObservation, type TagStats } from './scoring';
import { dealKindForPosition } from './schedule';
import {
    filterCandidates, penaltyFor, resolveCandidates,
    type SoftPenaltyContext,
} from './candidates';
import { selectProbeDishes } from './probe';

export interface EngineContext {
    deck: readonly Dish[];
    byId: ReadonlyMap<string, Dish>;
    tuning: Tuning;
}

export function createEngineContext(deck: readonly Dish[], tuning: Tuning): EngineContext {
    return { deck, byId: new Map(deck.map((d) => [d.id, d])), tuning };
}

// Everything the dealer may see — a projection of SessionState, never the state itself.
export interface DealerView {
    seed: number;
    mode: Mode;
    effortFilter: EffortFilter;
    dealerMode: DealerMode;
    dealerContext: DealerContext;
    stats: TagStats;
    dealtIds: readonly string[];
    shownIds: readonly string[];
    queuedIds: readonly string[];
    cardsDealt: number;
    now: number;
}

export function resolveDealerMode(tuning: Tuning, seed: number): DealerMode {
    if (tuning.DEALER_MODE !== 'auto') return tuning.DEALER_MODE;
    return seed % 2 === 0 ? 'adaptive' : 'shuffled';
}

export function penaltyContextOf(view: DealerView, tuning: Tuning): SoftPenaltyContext {
    const champion24hIds = new Set(
        view.dealerContext.recentChampions
            .filter((c) => view.now - c.ts <= tuning.CHAMPION_PENALTY_WINDOW_MS)
            .map((c) => c.dishId),
    );
    return { champion24hIds, lastSessionShownIds: new Set(view.dealerContext.lastSessionShownIds) };
}

function excludedIds(view: DealerView): Set<string> {
    return new Set([...view.shownIds, ...view.queuedIds]);
}

export type DealResult = { dishId: string } | { exhausted: true };

export function dealNext(ctx: EngineContext, view: DealerView, rng: Rng): DealResult {
    return view.dealerMode === 'shuffled' ? shuffledNext(ctx, view) : adaptiveNext(ctx, view, rng);
}

function adaptiveNext(ctx: EngineContext, view: DealerView, _rng: Rng): DealResult {
    const recentDeals = view.dealtIds
        .slice(-ctx.tuning.DIVERSITY_WINDOW)
        .map((id) => ctx.byId.get(id)!)
        .filter(Boolean);
    const resolution = resolveCandidates({
        deck: ctx.deck,
        mode: view.mode,
        effortFilter: view.effortFilter,
        excludeIds: excludedIds(view),
        recentDeals,
        tuning: ctx.tuning,
    });
    if ('exhausted' in resolution) return { exhausted: true };

    const { candidates, level } = resolution;
    const penaltyCtx = penaltyContextOf(view, ctx.tuning);
    const effectiveScore = (dish: Dish): number =>
        predictedScore(view.stats, dish, ctx.tuning) + penaltyFor(dish.id, penaltyCtx, ctx.tuning, level);

    const kind = dealKindForPosition(view.cardsDealt + 1, ctx.tuning);
    let best = candidates[0]!;
    if (kind === 'explore') {
        let bestUnder = underObservation(view.stats, best);
        let bestScore = effectiveScore(best);
        for (const dish of candidates.slice(1)) {
            const under = underObservation(view.stats, dish);
            const score = effectiveScore(dish);
            if (under > bestUnder || (under === bestUnder && score > bestScore)) {
                best = dish;
                bestUnder = under;
                bestScore = score;
            }
        }
    } else {
        let bestScore = effectiveScore(best);
        for (const dish of candidates.slice(1)) {
            const score = effectiveScore(dish);
            if (score > bestScore) {
                best = dish;
                bestScore = score;
            }
        }
    }
    return { dishId: best.id };
}

// Field-test baseline: a seeded Fisher-Yates over the mode/effort-filtered pool, always
// derived from decision 0, dealt in order skipping shown cards. No trio, no exploit or
// explore, no diversity guard, no soft penalties — it baselines the dealing policy only.
function shuffledNext(ctx: EngineContext, view: DealerView): DealResult {
    const pool = filterCandidates(ctx.deck, {
        mode: view.mode,
        effortFilter: view.effortFilter,
        excludeIds: new Set<string>(),
    });
    const order = shuffle(pool, deriveRng(view.seed, 0));
    const excluded = excludedIds(view);
    const next = order.find((dish) => !excluded.has(dish.id));
    return next ? { dishId: next.id } : { exhausted: true };
}

// Deterministic, RNG-free probe selection over never-shown dishes; null when unavailable.
export function selectProbe(ctx: EngineContext, view: DealerView): string[] | null {
    const unseen = filterCandidates(ctx.deck, {
        mode: view.mode,
        effortFilter: view.effortFilter,
        excludeIds: excludedIds(view),
    });
    const dishes = selectProbeDishes(unseen, view.stats, ctx.tuning);
    return dishes ? dishes.map((d) => d.id) : null;
}

// Would an extension actually deal anything? Requires at least one candidate at
// relaxation level ≥ 1 (guard dropped — penalties can never remove candidacy).
export function extensionHasCandidates(ctx: EngineContext, view: DealerView): boolean {
    return filterCandidates(ctx.deck, {
        mode: view.mode,
        effortFilter: view.effortFilter,
        excludeIds: excludedIds(view),
    }).length > 0;
}
