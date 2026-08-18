import { describe, expect, it } from 'vitest';
import { deck } from '../../shared/data/deck';
import { defaultTuning } from '../../shared/tuning';
import { replaySession } from '../../shared/session/replay';
import type { Mode } from '../../shared/types/dish';
import { agents } from './agents';
import { runAgentSession, type SimResult } from './runSession';

const SEEDS = 250;

function failureBundle(result: SimResult): string {
    return JSON.stringify({
        agent: result.agent, seed: result.seed, mode: result.mode,
        dealerMode: result.dealerMode, events: result.envelope.events,
    });
}

describe('simulation invariants (correctness only — efficiency is a printed report, never asserted)', () => {
    it('every session terminates legitimately with every cap respected, and replays identically', () => {
        for (const agent of agents) {
            for (let seed = 1; seed <= SEEDS; seed++) {
                const mode: Mode = seed % 4 < 2 ? 'takeaway' : 'cooking';
                const result = runAgentSession({ agent, seed, mode });
                const s = result.state;
                const info = () => failureBundle(result);

                // (1) legitimate terminal state — no forced verdicts anywhere
                expect(['saved', 'ended'], info()).toContain(s.phase);

                // (2) every finalist has an explicit positive reaction this session
                if (s.finalists !== null) {
                    for (const id of s.finalists) {
                        const reaction = s.reactions.find((r) => r.dishId === id);
                        expect(reaction, info()).toBeDefined();
                        expect(['like', 'superlike', 'probePick'], info()).toContain(reaction!.reaction);
                    }
                }

                // (3) caps: cards, probes, extension, OMG, event log.
                // +1: a probe pick exactly at the extension cap is a legitimate 19th card
                // (the probe rescue outranks the hard stop, and the pick counts as dealt).
                expect(s.cardsDealt, info()).toBeLessThanOrEqual(defaultTuning.MAX_CARDS + defaultTuning.EXTENSION_CARDS + 1);
                expect(s.probesUsed, info()).toBeLessThanOrEqual(defaultTuning.MAX_PROBES);
                expect(s.omgUsed, info()).toBeLessThanOrEqual(defaultTuning.OMG_CAP);
                expect(result.eventCount, info()).toBeLessThanOrEqual(defaultTuning.EVENT_LOG_MAX);

                // (4) a champion always carries an explicit positive unless it came from history
                if (s.championId !== null && s.crownSource !== 'history') {
                    const reaction = s.reactions.find((r) => r.dishId === s.championId);
                    expect(reaction, info()).toBeDefined();
                    expect(['like', 'superlike', 'probePick'], info()).toContain(reaction!.reaction);
                }

                // (5) a saved session has a champion with a crown source; sorted is the only
                // path into 'saved', so nothing can be saved without an explicit crown.
                if (s.phase === 'saved') {
                    expect(s.championId, info()).not.toBeNull();
                    expect(s.crownSource, info()).not.toBeNull();
                    expect(result.envelope.events.some((e) => e.type === 'crown'), info()).toBe(true);
                    expect(result.envelope.events.at(-1)!.type, info()).toBe('sorted');
                }
                // An ended session never ends with a save: no 'sorted' event exists in its log.
                if (s.phase === 'ended') {
                    expect(result.envelope.events.some((e) => e.type === 'sorted'), info()).toBe(false);
                    expect(result.envelope.events.at(-1)!.type, info()).toBe('end');
                }

                // (6) replay determinism through THE one code path
                const replayed = replaySession(result.envelope, deck, defaultTuning);
                expect(replayed, info()).toEqual(s);
            }
        }
    }, 120_000);

    it('previews never alter the outcome (A/B across a 25-seed subset, all agents)', () => {
        for (const agent of agents) {
            for (let seed = 1; seed <= 25; seed++) {
                const mode: Mode = seed % 4 < 2 ? 'takeaway' : 'cooking';
                const clean = runAgentSession({ agent, seed, mode });
                const previewed = runAgentSession({ agent, seed, mode, withPreviews: true });
                expect(previewed.state, `${agent.name} seed ${seed}`).toEqual(clean.state);
            }
        }
    }, 60_000);

    it('the refusenik always ends with nothing saved (no forced verdict exists)', () => {
        const refusenik = agents.find((a) => a.name === 'refusenik')!;
        for (let seed = 1; seed <= 40; seed++) {
            const result = runAgentSession({ agent: refusenik, seed, mode: 'takeaway' });
            expect(result.state.phase, failureBundle(result)).toBe('ended');
            expect(result.state.championId).toBeNull();
            expect(result.state.positives).toHaveLength(0);
        }
    });

    it('the one-liker exercises directOffer and the extension without ever losing its positive', () => {
        const oneLiker = agents.find((a) => a.name === 'one-liker')!;
        let sawOffer = 0;
        let sawExtension = 0;
        for (let seed = 1; seed <= 60; seed++) {
            const result = runAgentSession({ agent: oneLiker, seed, mode: 'takeaway' });
            const s = result.state;
            if (s.extension.used) sawExtension++;
            if (s.crownSource === 'direct') {
                sawOffer++;
                expect(s.championId).toBe('prawn-laksa');
            }
            expect(['saved', 'ended']).toContain(s.phase);
        }
        expect(sawOffer).toBeGreaterThan(0);
        expect(sawExtension).toBeGreaterThan(0);
    });
});
