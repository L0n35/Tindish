import { describe, expect, it } from 'vitest';
import { openMetrics, projectMetrics } from '#shared/session/metricsProjection';
import { baseContext as ctx, makeConfig, playBracketToChampion, start, swipeMany } from '../../helpers/session';
import { reduce } from '#shared/session/reducer';
import type { MetricsRecord } from '#shared/types/records';

describe('metrics projection', () => {
    it('opens at session start with one card dealt and nothing ended', () => {
        const rec = openMetrics(makeConfig(2), 'adaptive');
        expect(rec.cardsDealt).toBe(1);
        expect(rec.positives).toBe(0);
        expect(rec.endedAt).toBeUndefined();
        expect(rec.endedVia).toBeUndefined();
        expect(rec.dealerMode).toBe('adaptive');
    });

    it('tracks counters through a scripted session and finalises via sorted with the crown source', () => {
        const config = makeConfig(2);
        let rec: MetricsRecord = openMetrics(config, 'adaptive');
        let s = start(2);
        const t0 = config.startedAt;
        let now = t0;
        const step = (event: Parameters<typeof reduce>[2]) => {
            now += 1000;
            s = reduce(ctx, s, event);
            rec = projectMetrics(rec, event, s, now);
        };
        step({ type: 'swipe', dishId: s.currentCard!, reaction: 'superlike' });
        step({ type: 'swipe', dishId: s.currentCard!, reaction: 'like' });
        step({ type: 'swipe', dishId: s.currentCard!, reaction: 'dislike' });
        step({ type: 'swipe', dishId: s.currentCard!, reaction: 'like' });
        step({ type: 'swipe', dishId: s.currentCard!, reaction: 'like' });
        expect(s.phase).toBe('finalists');
        expect(rec.cardsDealt).toBe(5);
        expect(rec.positives).toBe(4);
        expect(rec.superlikes).toBe(1);

        while (!s.bracket!.complete) {
            const m = s.bracket!.matches[s.bracket!.currentMatchIndex]!;
            step({ type: 'bracketPick', matchIndex: s.bracket!.currentMatchIndex, winnerId: m.a! });
        }
        step({ type: 'crown', dishId: s.bracket!.championId!, source: 'bracket' });
        expect(rec.timeToChampionMs).toBe(now - t0);
        const champAt = rec.timeToChampionMs;

        // Runner-up promotion is a second crown: timeToChampionMs must not move.
        step({ type: 'crown', dishId: s.runnerUpId!, source: 'bracket' });
        expect(rec.timeToChampionMs).toBe(champAt);

        step({ type: 'sorted' });
        expect(rec.endedAt).toBe(now);
        expect(rec.endedVia).toBe('bracket');
    });

    it('end finalises endedVia ended', () => {
        const config = makeConfig(2);
        let rec = openMetrics(config, 'adaptive');
        let s = swipeMany(ctx, start(2), ['like']);
        s = reduce(ctx, s, { type: 'end' });
        rec = projectMetrics(rec, { type: 'end' }, s, config.startedAt + 5000);
        expect(rec.endedVia).toBe('ended');
        expect(rec.endedAt).toBe(config.startedAt + 5000);
        expect(rec.timeToChampionMs).toBeUndefined();
    });

    it('extension and probe counters project from state', () => {
        const config = makeConfig(2);
        let rec = openMetrics(config, 'adaptive');
        const s = playBracketToChampion(ctx, swipeMany(ctx, start(2), ['like', 'like', 'like', 'like']));
        rec = projectMetrics(rec, { type: 'crown', dishId: s.championId!, source: 'bracket' }, s, config.startedAt + 9000);
        expect(rec.extensionUsed).toBe(false);
        expect(rec.probesShown).toBe(0);
        expect(rec.timeToChampionMs).toBe(9000);
    });
});
