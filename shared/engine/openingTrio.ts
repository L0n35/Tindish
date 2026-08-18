import type { Dish } from '../types/dish';
import type { Tuning } from '../tuning';
import type { Rng } from './rng';
import { tagDistance } from './tags';
import type { SoftPenaltyContext } from './candidates';

// Exhaustive max-min-pairwise-distance trio (≤ ~20k combinations at deck scale).
// Secondary objective: among distance-tied trios, the fewest penalized members
// (a 24h champion counts double, so it loses ties to a merely-stale card).
// Remaining ties resolved by the injected seeded RNG. Deal order: ascending id.
export function selectOpeningTrio(
    candidates: readonly Dish[],
    penaltyCtx: SoftPenaltyContext,
    _tuning: Tuning,
    rng: Rng,
): [Dish, Dish, Dish] {
    if (candidates.length < 3) {
        throw new Error(`opening trio needs at least 3 candidates, got ${candidates.length}`);
    }
    const penaltyCount = (d: Dish): number =>
        (penaltyCtx.champion24hIds.has(d.id) ? 2 : 0) + (penaltyCtx.lastSessionShownIds.has(d.id) ? 1 : 0);

    let bestDistance = -1;
    let bestPenalty = Number.POSITIVE_INFINITY;
    let ties: [Dish, Dish, Dish][] = [];

    for (let i = 0; i < candidates.length - 2; i++) {
        for (let j = i + 1; j < candidates.length - 1; j++) {
            const dij = tagDistance(candidates[i]!, candidates[j]!);
            if (dij < bestDistance) continue;
            for (let k = j + 1; k < candidates.length; k++) {
                const minPair = Math.min(
                    dij,
                    tagDistance(candidates[i]!, candidates[k]!),
                    tagDistance(candidates[j]!, candidates[k]!),
                );
                if (minPair < bestDistance) continue;
                const trio: [Dish, Dish, Dish] = [candidates[i]!, candidates[j]!, candidates[k]!];
                const penalty = penaltyCount(trio[0]) + penaltyCount(trio[1]) + penaltyCount(trio[2]);
                if (minPair > bestDistance || (minPair === bestDistance && penalty < bestPenalty)) {
                    bestDistance = minPair;
                    bestPenalty = penalty;
                    ties = [trio];
                } else if (minPair === bestDistance && penalty === bestPenalty) {
                    ties.push(trio);
                }
            }
        }
    }

    const picked = ties[Math.floor(rng() * ties.length)]!;
    return [...picked].sort((a, b) => (a.id < b.id ? -1 : 1)) as [Dish, Dish, Dish];
}
