// shared/tuning.ts — every tunable in the app lives here, every value commented.
// This file is the intentional exception to the minimal-comments convention.
// Bump `tuningVersion` on ANY value change: it is persisted in session envelopes,
// and a mismatch makes an old envelope non-replayable (it is discarded on load).

export type DealKind = 'exploit' | 'explore';
export type DealerModeSetting = 'adaptive' | 'shuffled' | 'auto';
export type ReactionWeightKey = 'like' | 'dislike' | 'superlike' | 'probePick';

export interface Tuning {
    tuningVersion: number;
    reactionWeights: Record<ReactionWeightKey, number>;
    K: number;
    DEAL_BLOCK: readonly DealKind[];
    MAX_CARDS: number;
    EXTENSION_CARDS: number;
    MAX_PROBES: number;
    PROBE_SIZE: number;
    STREAK_THRESHOLD: number;
    TARGET_POSITIVES: number;
    OMG_CAP: number;
    MAX_SESSION_ACTIONS: number;
    EVENT_LOG_MAX: number;
    UNDO_LOG_CEILING: number;
    CHAMPION_24H_PENALTY: number;
    CHAMPION_PENALTY_WINDOW_MS: number;
    LAST_SESSION_SHOWN_PENALTY: number;
    DIVERSITY_WINDOW: number;
    HISTORY_FALLBACK_COUNT: number;
    DEALER_MODE: DealerModeSetting;
    ACTIVE_SESSION_MAX_AGE_MS: number;
    HISTORY_KEEP: number;
    METRICS_KEEP: number;
}

export const defaultTuning: Tuning = {
    // Version stamp persisted into every session envelope; bump on ANY change in this file.
    tuningVersion: 1,

    // Signal strength each reaction applies to every tag value of the dish (§5.1).
    // Dislike is deliberately weaker than superlike so one bad pizza doesn't bury Italian.
    reactionWeights: { like: 1, superlike: 2, probePick: 2, dislike: -1.5 },

    // Preference smoothing: preference = sum / (count + K). Higher K = slower to trust few signals.
    K: 1,

    // Repeating deal pattern from card 4 onward. Three exploits then one explore means
    // adaptation starts immediately at card 4 and the first explore lands at card 7 (§5.2).
    DEAL_BLOCK: ['exploit', 'exploit', 'exploit', 'explore'],

    // Hard stop for the base round — a session never deals more than this many cards (§5.3).
    MAX_CARDS: 12,

    // "Deal 6 more cards" from the direct offer; available once per session, ever (§5.5).
    EXTENSION_CARDS: 6,

    // Probe screens per session (§5.4).
    MAX_PROBES: 2,

    // Dishes per probe screen, all different primary formats where possible (§5.4).
    PROBE_SIZE: 4,

    // Consecutive dislikes that trigger a probe. The streak persists through "None of these";
    // only a positive (like / superlike / probePick) resets it (user ruling).
    STREAK_THRESHOLD: 7,

    // The round stops the instant this many distinct positives exist (§5.3).
    TARGET_POSITIVES: 4,

    // Superlikes (OMG) per session. probePick neither consumes nor requires one (§5.4).
    OMG_CAP: 3,

    // Narrate-boundary cap on the reactions array. Real worst case is 20
    // (18 dealt cards + 2 probe picks); 24 is deliberate headroom (§7).
    MAX_SESSION_ACTIONS: 24,

    // Bound on the persisted event log (§3.2). Never truncated — appends past this refuse
    // the whole dispatch, so a persisted envelope always re-folds to the live state.
    EVENT_LOG_MAX: 64,

    // The undo control disables once the log reaches this length: 64 minus the ~30 real
    // (non-undo) events a worst-case session still needs to reach a legitimate end state.
    UNDO_LOG_CEILING: 34,

    // Strong score penalty for champions crowned within the window; they stay dealable
    // and finalist-eligible — soft penalty, never an exclusion (§5.2).
    CHAMPION_24H_PENALTY: -1.0,

    // The window for the champion penalty: 24 hours.
    CHAMPION_PENALTY_WINDOW_MS: 86_400_000,

    // Gentle staleness nudge for dishes shown in the previous session. Predicted scores live
    // roughly in [-0.75, +1.5]; -0.25 deprioritises without burying (spec names no value).
    LAST_SESSION_SHOWN_PENALTY: -0.25,

    // Look-back window for the diversity guard. 2 previous deals sharing a cuisine or
    // primary format block a third — "never 3 consecutive" (§5.2).
    DIVERSITY_WINDOW: 2,

    // Past champions offered on the history-fallback screen (§5.4).
    HISTORY_FALLBACK_COUNT: 3,

    // 'auto' alternates dealer by seed parity (even = adaptive, odd = shuffled) so the
    // field test (§15) A/Bs itself with no file edits between dinners.
    DEALER_MODE: 'auto',

    // Reload restore window (user ruling): an interrupted session younger than this
    // auto-restores; older is discarded and its metrics record marked abandoned.
    ACTIVE_SESSION_MAX_AGE_MS: 21_600_000, // 6 hours

    // History records kept (newest first) (§8).
    HISTORY_KEEP: 30,

    // Metrics records kept (spec leaves unbounded; trimmed FIFO for storage hygiene).
    METRICS_KEEP: 100,
};

// Version re-export used by the envelope/persistence layer.
export const TUNING_VERSION = defaultTuning.tuningVersion;

// Swipe-surface physics. UI tunables, not dealer tunables — but "every tunable lives in
// shared/tuning.ts" (§2), so they live here, commented like everything else.
export const swipe = {
    // Fraction of card width (x) / height (y) the drag must cover to commit without velocity.
    commitDistanceRatio: 0.32,
    // Flick commit threshold in px/ms measured over the last ~80ms of pointer samples.
    commitVelocity: 0.6,
    // OMG (up) only wins when |dy| exceeds this multiple of |dx| — up must clearly dominate.
    upDominance: 1.2,
    // Card tilt clamp in degrees.
    maxRotationDeg: 12,
    // Degrees of tilt per horizontal pixel dragged.
    rotationPerPx: 0.08,
    // Stamp reaches full opacity at this fraction of the commit distance.
    stampFullAt: 0.6,
    // Commit fly-out duration (ms).
    flyOutMs: 220,
    // Spring-back duration for non-commits and the OMG-cap bounce (ms).
    springBackMs: 260,
    // Next-card entrance duration (ms).
    nextCardInMs: 180,
} as const;

// Reserved RNG decision index for the narration template pick — far above any index a
// dealer could reach (dealer indices stay below EVENT_LOG_MAX), so replays are stable
// and template choice never perturbs the deal sequence.
export const RESERVED_NARRATION_INDEX = 0x7fff_ffff;
