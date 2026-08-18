import { describe, expect, it } from 'vitest';
import { deck, deckById } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import {
    filterCandidates, penaltyFor, resolveCandidates, violatesDiversityGuard,
} from '#shared/engine/candidates';

const none = new Set<string>();

describe('filterCandidates', () => {
    it('filters by mode', () => {
        const cooking = filterCandidates(deck, { mode: 'cooking', effortFilter: 'noLimit', excludeIds: none });
        expect(cooking.every((d) => d.modes.includes('cooking'))).toBe(true);
        expect(cooking).toHaveLength(deck.filter((d) => d.modes.includes('cooking')).length);
    });

    it('Quick tonight keeps only effort:quick, and only in cooking mode', () => {
        const quick = filterCandidates(deck, { mode: 'cooking', effortFilter: 'quick', excludeIds: none });
        expect(quick.every((d) => d.tags.effort === 'quick')).toBe(true);
        // Quick filter never applies to takeaway — the full takeaway pool comes back.
        const takeaway = filterCandidates(deck, { mode: 'takeaway', effortFilter: 'quick', excludeIds: none });
        expect(takeaway).toHaveLength(deck.filter((d) => d.modes.includes('takeaway')).length);
    });

    it('excludes shown ids and sorts by id', () => {
        const all = filterCandidates(deck, { mode: 'takeaway', effortFilter: 'noLimit', excludeIds: none });
        const excluded = filterCandidates(deck, {
            mode: 'takeaway', effortFilter: 'noLimit', excludeIds: new Set([all[0]!.id]),
        });
        expect(excluded).toHaveLength(all.length - 1);
        expect(excluded.map((d) => d.id)).toEqual([...excluded.map((d) => d.id)].sort());
    });
});

describe('diversity guard', () => {
    const padThai = deckById.get('chicken-pad-thai')!;      // thai noodles
    const padSeeEw = deckById.get('pad-see-ew')!;           // thai noodles
    const greenCurry = deckById.get('thai-green-curry')!;   // thai stew
    const chowMein = deckById.get('crispy-beef-chow-mein')!; // chinese noodles
    const pho = deckById.get('beef-pho')!;                  // vietnamese soup

    it('rejects a 3rd consecutive same-cuisine card', () => {
        expect(violatesDiversityGuard(greenCurry, [padThai, padSeeEw], defaultTuning)).toBe(true);
    });

    it('rejects a 3rd consecutive same-format card', () => {
        expect(violatesDiversityGuard(chowMein, [padThai, padSeeEw], defaultTuning)).toBe(true);
    });

    it('allows when the previous two differ', () => {
        expect(violatesDiversityGuard(greenCurry, [padThai, pho], defaultTuning)).toBe(false);
    });

    it('never fires with fewer than DIVERSITY_WINDOW recent deals', () => {
        expect(violatesDiversityGuard(padSeeEw, [padThai], defaultTuning)).toBe(false);
    });
});

describe('soft penalties and the relaxation ladder', () => {
    it('applies the 24h champion penalty and the last-session penalty by relaxation level', () => {
        const ctx = { champion24hIds: new Set(['a']), lastSessionShownIds: new Set(['a', 'b']) };
        expect(penaltyFor('a', ctx, defaultTuning, 0)).toBeCloseTo(-1.25);
        expect(penaltyFor('b', ctx, defaultTuning, 0)).toBeCloseTo(-0.25);
        expect(penaltyFor('a', ctx, defaultTuning, 2)).toBeCloseTo(-1.0);  // last-session dropped
        expect(penaltyFor('a', ctx, defaultTuning, 3)).toBe(0);            // both dropped
    });

    it('rung 1 drops the guard and restores candidacy', () => {
        const padThai = deckById.get('chicken-pad-thai')!;
        const padSeeEw = deckById.get('pad-see-ew')!;
        // Exclude everything except one guard-violating dish.
        const survivor = deckById.get('crispy-beef-chow-mein')!;
        const excludeIds = new Set(deck.filter((d) => d.id !== survivor.id).map((d) => d.id));
        const result = resolveCandidates({
            deck, mode: 'takeaway', effortFilter: 'noLimit',
            excludeIds, recentDeals: [padThai, padSeeEw], tuning: defaultTuning,
        });
        expect('exhausted' in result).toBe(false);
        if (!('exhausted' in result)) {
            expect(result.level).toBe(1);
            expect(result.candidates.map((d) => d.id)).toEqual([survivor.id]);
        }
    });

    it('an empty base pool is exhausted (rung 4)', () => {
        const excludeIds = new Set(deck.map((d) => d.id));
        const result = resolveCandidates({
            deck, mode: 'takeaway', effortFilter: 'noLimit',
            excludeIds, recentDeals: [], tuning: defaultTuning,
        });
        expect('exhausted' in result).toBe(true);
    });
});
