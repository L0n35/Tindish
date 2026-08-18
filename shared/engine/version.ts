// Bump on any semantic change to the dealer, reducer, or RNG derivation — a mismatch
// makes persisted envelopes non-replayable and they are discarded on load (README rule).
export const ENGINE_VERSION = 2;
