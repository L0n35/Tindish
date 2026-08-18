import { describe, expect, it } from 'vitest';
import { localNarration } from '#shared/templates/narration';
import type { TimeOfDay } from '#shared/utils/timeOfDay';

const times: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];
const picks = [0, 0.2, 0.4, 0.6, 0.8, 0.999];

describe('local narration templates', () => {
    it('history source always uses the dedicated pool, ignoring tags', () => {
        for (const pick of picks) {
            const line = localNarration({
                dishName: 'Prawn laksa',
                source: 'history',
                topTags: [{ dimension: 'vibe', value: 'comfort' }],
                timeOfDay: 'evening',
                pick,
            });
            expect(line).toContain('Prawn laksa');
            expect(line.toLowerCase()).not.toContain('comfort');
        }
    });

    it('is deterministic for equal pick values', () => {
        const input = {
            dishName: 'Beef pho', source: 'bracket' as const,
            topTags: [{ dimension: 'vibe', value: 'fresh' }],
            timeOfDay: 'evening' as const, pick: 0.5,
        };
        expect(localNarration(input)).toBe(localNarration({ ...input }));
    });

    it('every template renders without leftover placeholders for all time buckets, with and without tags', () => {
        for (const time of times) {
            for (const pick of picks) {
                for (const topTags of [[], [{ dimension: 'vibe', value: 'indulgent' }], [{ dimension: 'cuisine', value: 'thai' }]]) {
                    for (const source of ['bracket', 'direct', 'history'] as const) {
                        const line = localNarration({ dishName: 'Katsu sando', source, topTags, timeOfDay: time, pick });
                        expect(line).toBeTruthy();
                        expect(line).not.toMatch(/[{}]/);
                        expect(line).toContain('Katsu sando');
                    }
                }
            }
        }
    });

    it('never surfaces raw numeric tag values — spice/richness are humanized to words', () => {
        const numericTags = [
            { dimension: 'spice', value: '0' }, { dimension: 'spice', value: '3' },
            { dimension: 'richness', value: '1' }, { dimension: 'richness', value: '2' },
            { dimension: 'richness', value: '3' },
        ];
        for (const tag of numericTags) {
            for (const pick of picks) {
                const line = localNarration({
                    dishName: 'Katsu sando', source: 'bracket', topTags: [tag], timeOfDay: 'evening', pick,
                });
                expect(line, `${tag.dimension}:${tag.value} pick=${pick}`).not.toMatch(/\b[0-3]\b/);
            }
        }
    });

    it('out-of-range picks clamp instead of crashing', () => {
        expect(() => localNarration({
            dishName: 'X', source: 'bracket', topTags: [], timeOfDay: 'night', pick: 1.5,
        })).not.toThrow();
        expect(() => localNarration({
            dishName: 'X', source: 'direct', topTags: [], timeOfDay: 'night', pick: -1,
        })).not.toThrow();
    });
});
