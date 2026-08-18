import type { Mode } from './dish';
import type { CrownSource, DealerMode, SessionEvent, DealerContext } from './session';

export interface HistoryRecord {
    sessionId: string;
    seed: number;
    engineVersion: number;
    deckHash: string;
    tuningVersion: number;
    events: SessionEvent[];
    mode: Mode;
    dealerContext: DealerContext;
    startedAt: number;
    shownIds: string[];
    championId: string;
    runnerUpId?: string;
    source: CrownSource;
    usedRunnerUp: boolean;
    ts: number;
}

export type EndedVia = 'bracket' | 'direct' | 'history' | 'ended' | 'abandoned';

export interface MetricsRecord {
    sessionId: string;
    seed: number;
    dealerMode: DealerMode;
    startedAt: number;
    endedAt?: number;
    endedVia?: EndedVia;
    cardsDealt: number;
    positives: number;
    superlikes: number;
    probesShown: number;
    extensionUsed: boolean;
    timeToChampionMs?: number;
    eaten?: boolean;
}
