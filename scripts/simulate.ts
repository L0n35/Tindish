// Printed efficiency report: adaptive vs shuffled per agent. Correctness invariants live
// in tests/simulation/invariants.spec.ts — this report is informational only and is never
// asserted in CI (asserting the desired conclusion just invites tuning the sim to agree).
//
// Usage: npm run sim [-- --seeds 500] [--agent hearty] [--mode cooking]

import { defaultTuning } from '../shared/tuning';
import { deck } from '../shared/data/deck';
import { createEngineContext } from '../shared/engine/dealer';
import type { Mode } from '../shared/types/dish';
import { agents } from '../tests/simulation/agents';
import { runAgentSession, type SimResult } from '../tests/simulation/runSession';

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
}

const seedsPerCell = Number(flag('seeds') ?? 300);
const onlyAgent = flag('agent');
const mode = (flag('mode') ?? 'takeaway') as Mode;

interface CellStats {
    sessions: number;
    reachedFinalists: number;
    meanCardsToFinalists: number;
    meanChampionUtility: number;
    probeRate: number;
    extensionRate: number;
    fallbackRate: number;
    endedRate: number;
}

function summarize(results: SimResult[]): CellStats {
    const finalists = results.filter((r) => r.cardsToFinalists !== null);
    const champions = results.filter((r) => r.championUtility !== null);
    return {
        sessions: results.length,
        reachedFinalists: finalists.length,
        meanCardsToFinalists: finalists.length
            ? finalists.reduce((sum, r) => sum + r.cardsToFinalists!, 0) / finalists.length
            : NaN,
        meanChampionUtility: champions.length
            ? champions.reduce((sum, r) => sum + r.championUtility!, 0) / champions.length
            : NaN,
        probeRate: results.filter((r) => r.state.probesUsed > 0).length / results.length,
        extensionRate: results.filter((r) => r.state.extension.used).length / results.length,
        fallbackRate: results.filter((r) => r.envelope.events.some((e) => e.type === 'probeNone')).length / results.length,
        endedRate: results.filter((r) => r.state.phase === 'ended').length / results.length,
    };
}

const fmt = (n: number, digits = 2) => (Number.isNaN(n) ? '  —  ' : n.toFixed(digits).padStart(5));

// Force each dealer explicitly (DEALER_MODE override) so every seed runs both ways.
const roster = agents.filter((a) => !onlyAgent || a.name === onlyAgent);
console.log(`tindish sim — ${seedsPerCell} seeds/cell · mode=${mode} · tuningVersion=${defaultTuning.tuningVersion}\n`);
console.log('agent          dealer     finals%  cards→finals  champ-utility  probe%  ext%  ended%');
console.log('─'.repeat(88));

for (const agent of roster) {
    const rows: string[] = [];
    const cells: Record<string, CellStats> = {};
    for (const dealerMode of ['adaptive', 'shuffled'] as const) {
        const tuning = { ...defaultTuning, DEALER_MODE: dealerMode };
        const ctx = createEngineContext(deck, tuning);
        const results: SimResult[] = [];
        for (let seed = 1; seed <= seedsPerCell; seed++) {
            results.push(runAgentSession({ agent, seed, mode, ctx, tuning }));
        }
        const stats = summarize(results);
        cells[dealerMode] = stats;
        rows.push([
            agent.name.padEnd(14),
            dealerMode.padEnd(10),
            fmt((stats.reachedFinalists / stats.sessions) * 100, 1) + '%',
            fmt(stats.meanCardsToFinalists).padStart(12),
            fmt(stats.meanChampionUtility).padStart(13),
            fmt(stats.probeRate * 100, 1).padStart(6) + '%',
            fmt(stats.extensionRate * 100, 1).padStart(4) + '%',
            fmt(stats.endedRate * 100, 1).padStart(6) + '%',
        ].join('  '));
    }
    console.log(rows.join('\n'));
    const a = cells.adaptive!;
    const s = cells.shuffled!;
    const delta = s.meanCardsToFinalists - a.meanCardsToFinalists;
    const utilityDelta = a.meanChampionUtility - s.meanChampionUtility;
    console.log(
        `  Δ adaptive vs shuffled: ${Number.isNaN(delta) ? 'n/a' : `${delta >= 0 ? '' : '+'}${(-delta).toFixed(2)} cards to finalists`}`
        + `${Number.isNaN(utilityDelta) ? '' : `, ${utilityDelta >= 0 ? '+' : ''}${utilityDelta.toFixed(2)} champion utility`}\n`,
    );
}

console.log('Directional signal only — ten dinners beats a thousand simulations. Tune shared/tuning.ts before adding features.');
