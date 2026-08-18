import type { Tuning } from '../tuning';

export type DealKind = 'openingTrio' | 'exploit' | 'explore';

// position = 1-based index of the card about to be dealt (state.cardsDealt + 1).
// Cards 1–3 are the opening trio; from card 4 the DEAL_BLOCK repeats, so with
// [exploit, exploit, exploit, explore] the first explore lands at card 7.
export function dealKindForPosition(position: number, tuning: Tuning): DealKind {
    if (position <= 3) return 'openingTrio';
    return tuning.DEAL_BLOCK[(position - 4) % tuning.DEAL_BLOCK.length]!;
}
