import { describe, expect, it } from 'vitest';
import { deckById } from '#shared/data/deck';
import { defaultTuning } from '#shared/tuning';
import { applyReaction, type TagStats } from '#shared/engine/scoring';
import { createBracket, finalLoser, reportWinner, seedFinalists } from '#shared/engine/bracket';

const ids = ['beef-pho', 'chicken-burrito', 'falafel-wrap', 'katsu-sando'];

describe('seedFinalists', () => {
    it('orders superlikes (in superlike order) before probePicks before likes by predicted score', () => {
        let stats: TagStats = {};
        stats = applyReaction(stats, deckById.get('beef-pho')!, 'like', defaultTuning);
        stats = applyReaction(stats, deckById.get('chicken-burrito')!, 'superlike', defaultTuning);
        stats = applyReaction(stats, deckById.get('falafel-wrap')!, 'probePick', defaultTuning);
        stats = applyReaction(stats, deckById.get('katsu-sando')!, 'like', defaultTuning);
        const seeds = seedFinalists({
            positives: ids,
            superlikeOrder: ['chicken-burrito'],
            reactions: [
                { dishId: 'beef-pho', reaction: 'like' },
                { dishId: 'chicken-burrito', reaction: 'superlike' },
                { dishId: 'falafel-wrap', reaction: 'probePick' },
                { dishId: 'katsu-sando', reaction: 'like' },
            ],
            stats,
            byId: deckById,
            tuning: defaultTuning,
        });
        expect(seeds[0]).toBe('chicken-burrito');
        expect(seeds[1]).toBe('falafel-wrap');
        expect(seeds.slice(2).sort()).toEqual(['beef-pho', 'katsu-sando']);
    });
});

describe('bracket shapes', () => {
    it('shape 4: semis 1v4 and 2v3 feed the final in match order', () => {
        let b = createBracket(['s1', 's2', 's3', 's4']);
        expect(b.matches.map((m) => m.label)).toEqual(['semi1', 'semi2', 'final']);
        expect([b.matches[0]!.a, b.matches[0]!.b]).toEqual(['s1', 's4']);
        expect([b.matches[1]!.a, b.matches[1]!.b]).toEqual(['s2', 's3']);
        b = reportWinner(b, 0, 's1');
        b = reportWinner(b, 1, 's3');
        expect([b.matches[2]!.a, b.matches[2]!.b]).toEqual(['s1', 's3']);
        b = reportWinner(b, 2, 's3');
        expect(b.complete).toBe(true);
        expect(b.championId).toBe('s3');
        expect(finalLoser(b)).toBe('s1');
    });

    it('shape 3: seed 1 byes into the final', () => {
        let b = createBracket(['s1', 's2', 's3']);
        expect(b.matches.map((m) => m.label)).toEqual(['semi1', 'final']);
        expect([b.matches[0]!.a, b.matches[0]!.b]).toEqual(['s2', 's3']);
        expect(b.matches[1]!.a).toBe('s1');
        b = reportWinner(b, 0, 's2');
        expect(b.matches[1]!.b).toBe('s2');
        b = reportWinner(b, 1, 's1');
        expect(b.championId).toBe('s1');
        expect(finalLoser(b)).toBe('s2');
    });

    it('shape 2: straight final', () => {
        let b = createBracket(['s1', 's2']);
        expect(b.matches).toHaveLength(1);
        b = reportWinner(b, 0, 's2');
        expect(b.championId).toBe('s2');
        expect(finalLoser(b)).toBe('s1');
    });

    it('rejects 0, 1, or 5 seeds', () => {
        expect(() => createBracket([])).toThrow();
        expect(() => createBracket(['x'])).toThrow();
        expect(() => createBracket(['a', 'b', 'c', 'd', 'e'])).toThrow();
    });

    it('reportWinner throws on wrong match index or a foreign winner id', () => {
        const b = createBracket(['s1', 's2', 's3', 's4']);
        expect(() => reportWinner(b, 1, 's2')).toThrow();
        expect(() => reportWinner(b, 0, 's3')).toThrow();
        expect(() => reportWinner(b, 2, 's1')).toThrow();
    });
});
