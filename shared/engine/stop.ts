import type { Phase } from '../types/session';

// Hard-stop resolution by positives held (user ruling: her explicit positives always win;
// historyFallback is reserved for zero positives).
export function resolveByPositives(count: number): Extract<Phase, 'finalists' | 'directOffer' | 'historyFallback'> {
    if (count >= 2) return 'finalists';
    if (count === 1) return 'directOffer';
    return 'historyFallback';
}
