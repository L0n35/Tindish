import type { Mode } from './dish';
import type { TagStats, Reaction } from '../engine/scoring';

export type SwipeReaction = 'like' | 'dislike' | 'superlike';
export type CrownSource = 'bracket' | 'direct' | 'history';
export type DealerMode = 'adaptive' | 'shuffled';
export type { Reaction };

export type Phase =
    | 'swiping'
    | 'probe'
    | 'finalists'
    | 'directOffer'
    | 'historyFallback'
    | 'bracket'
    | 'match'
    | 'saved'
    | 'ended';

export interface DealerContext {
    recentChampions: { dishId: string; ts: number }[];
    lastSessionShownIds: string[];
    historyChampionIds: string[];
}

export interface SessionConfig {
    sessionId: string;
    seed: number;
    mode: Mode;
    dealerContext: DealerContext;
    startedAt: number;
}

export type SessionEvent =
    | { type: 'swipe'; dishId: string; reaction: SwipeReaction }
    | { type: 'undo' }
    | { type: 'probeShown'; dishIds: string[] }
    | { type: 'probePick'; dishId: string }
    | { type: 'probeNone' }
    | { type: 'extend' }
    | { type: 'bracketPick'; matchIndex: number; winnerId: string }
    | { type: 'crown'; dishId: string; source: CrownSource }
    | { type: 'sorted' }
    | { type: 'end' };

export interface SessionEnvelope {
    v: 1;
    sessionId: string;
    seed: number;
    engineVersion: number;
    deckHash: string;
    tuningVersion: number;
    mode: Mode;
    dealerContext: DealerContext;
    startedAt: number;
    events: SessionEvent[];
}

export type BracketLabel = 'semi1' | 'semi2' | 'final';

export interface BracketMatch {
    a: string | null;
    b: string | null;
    label: BracketLabel;
    winnerId: string | null;
}

export interface BracketState {
    matches: BracketMatch[];
    currentMatchIndex: number;
    complete: boolean;
    championId: string | null;
}

export interface SessionState {
    phase: Phase;
    config: SessionConfig;
    dealerMode: DealerMode;
    decisionIndex: number;
    engine: { stats: TagStats };
    dealtIds: string[];
    shownIds: string[];
    dealQueue: string[];
    currentCard: string | null;
    cardsDealt: number;
    cardBudget: number;
    reactions: { dishId: string; reaction: Reaction }[];
    positives: string[];
    superlikeOrder: string[];
    omgUsed: number;
    dislikeStreak: number;
    probesUsed: number;
    probe: { dishIds: string[] | null } | null;
    extension: { used: boolean; active: boolean };
    hardStopReason: 'maxCards' | 'exhausted' | null;
    finalists: string[] | null;
    bracket: BracketState | null;
    championId: string | null;
    runnerUpId: string | null;
    crownSource: CrownSource | null;
    usedRunnerUp: boolean;
    undo: { prev: SessionState } | null;
}
