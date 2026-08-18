import type { MetricsRecord } from '../types/records';
import type { DealerMode, SessionConfig, SessionEvent, SessionState } from '../types/session';

export function openMetrics(config: SessionConfig, dealerMode: DealerMode): MetricsRecord {
    return {
        sessionId: config.sessionId,
        seed: config.seed,
        dealerMode,
        startedAt: config.startedAt,
        cardsDealt: 1,
        positives: 0,
        superlikes: 0,
        probesShown: 0,
        extensionUsed: false,
    };
}

export function projectMetrics(rec: MetricsRecord, event: SessionEvent, next: SessionState, now: number): MetricsRecord {
    const updated: MetricsRecord = {
        ...rec,
        cardsDealt: next.cardsDealt,
        positives: next.positives.length,
        superlikes: next.omgUsed,
        probesShown: next.probesUsed,
        extensionUsed: next.extension.used,
    };
    if (event.type === 'crown' && updated.timeToChampionMs === undefined) {
        updated.timeToChampionMs = now - rec.startedAt;
    }
    if (event.type === 'sorted') {
        updated.endedAt = now;
        updated.endedVia = next.crownSource ?? 'ended';
    }
    if (event.type === 'end') {
        updated.endedAt = now;
        updated.endedVia = 'ended';
    }
    return updated;
}
