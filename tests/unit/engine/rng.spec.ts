import { describe, expect, it } from 'vitest';
import { deriveRng, hashCombine, mulberry32, shuffle } from '#shared/engine/rng';

describe('mulberry32', () => {
    it('is deterministic for a given seed', () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        const seqA = [a(), a(), a(), a()];
        const seqB = [b(), b(), b(), b()];
        expect(seqA).toEqual(seqB);
    });

    it('stays within [0, 1)', () => {
        const rng = mulberry32(7);
        for (let i = 0; i < 1000; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe('deriveRng', () => {
    it('is deterministic per (seed, decisionIndex, branch)', () => {
        expect(deriveRng(9, 3)()).toBe(deriveRng(9, 3)());
        expect(deriveRng(9, 3, 1)()).toBe(deriveRng(9, 3, 1)());
    });

    it('adjacent decision indexes decorrelate (avalanche on the derived hash)', () => {
        let strongPairs = 0;
        for (let seed = 1; seed <= 50; seed++) {
            const a = hashCombine(seed, 1);
            const b = hashCombine(seed, 2);
            const differing = ((a ^ b).toString(2).match(/1/g) ?? []).length;
            if (differing > 10) strongPairs++;
        }
        expect(strongPairs).toBeGreaterThanOrEqual(45);
    });

    it('branch forks never affect the unbranched derivation', () => {
        const before = deriveRng(11, 5)();
        deriveRng(11, 5, 1)();
        deriveRng(11, 5, 2)();
        expect(deriveRng(11, 5)()).toBe(before);
    });
});

describe('shuffle', () => {
    it('is a seeded permutation: deterministic, same members, new array', () => {
        const items = ['a', 'b', 'c', 'd', 'e', 'f'];
        const first = shuffle(items, deriveRng(3, 0));
        const second = shuffle(items, deriveRng(3, 0));
        expect(first).toEqual(second);
        expect([...first].sort()).toEqual([...items].sort());
        expect(first).not.toBe(items);
    });
});
