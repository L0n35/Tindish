export type Rng = () => number;

export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function splitmix32Finalize(z: number): number {
    z = (z ^ (z >>> 16)) >>> 0;
    z = Math.imul(z, 0x21f0aaad) >>> 0;
    z = (z ^ (z >>> 15)) >>> 0;
    z = Math.imul(z, 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
}

export function hashCombine(seed: number, ...indices: number[]): number {
    let h = seed >>> 0;
    for (const x of indices) {
        h = splitmix32Finalize((h + Math.imul(0x9e3779b9, (x + 1) >>> 0)) >>> 0);
    }
    return h;
}

// Counter-based derivation: every real decision draws from a fresh generator keyed by
// (seed, decisionIndex). There is no shared mutable stream anywhere, which is what makes
// previews pure by construction — and, because a preview recomputes the real transition
// at the same decisionIndex, exactly predictive of the next deal. The `branch` parameter
// honours the spec's (seed, decisionIndex, branch) wording; branches share the decision
// index and differ only through the hypothetical state they are applied to.
export function deriveRng(seed: number, decisionIndex: number, branch = 0): Rng {
    return mulberry32(hashCombine(seed, decisionIndex, branch));
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}
