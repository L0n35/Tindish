// Hidden-preference agents for the simulation harness. Relative imports (not #shared)
// so both Vitest and the tsx-run report script can load this module.
import type { Dish } from '../../shared/types/dish';
import { tagValuesOf } from '../../shared/engine/tags';
import type { Rng } from '../../shared/engine/rng';

export interface AgentProfile {
    name: string;
    values: Record<string, number>;
    likeThreshold: number;
    superlikeThreshold: number;
    noiseSd: number;
    extends: boolean;               // takes the 6-card extension when offered
    probeEngages: boolean;          // false = always "None of these"
}

export function utility(agent: AgentProfile, dish: Dish): number {
    let u = 0;
    for (const key of tagValuesOf(dish)) u += agent.values[key] ?? 0;
    return u;
}

function gaussian(rng: Rng): number {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function noisyUtility(agent: AgentProfile, dish: Dish, rng: Rng): number {
    return utility(agent, dish) + gaussian(rng) * agent.noiseSd;
}

export function agentReact(agent: AgentProfile, dish: Dish, rng: Rng): 'like' | 'dislike' | 'superlike' {
    const u = noisyUtility(agent, dish, rng);
    if (u >= agent.superlikeThreshold) return 'superlike';
    if (u >= agent.likeThreshold) return 'like';
    return 'dislike';
}

export function agentProbeChoice(agent: AgentProfile, dishes: Dish[], rng: Rng): string | 'none' {
    if (!agent.probeEngages) return 'none';
    let best: Dish | null = null;
    let bestU = -Infinity;
    for (const dish of dishes) {
        const u = noisyUtility(agent, dish, rng);
        if (u > bestU) {
            best = dish;
            bestU = u;
        }
    }
    return best !== null && bestU >= agent.likeThreshold ? best.id : 'none';
}

export function agentBracketPick(agent: AgentProfile, a: Dish, b: Dish, rng: Rng): string {
    return noisyUtility(agent, a, rng) >= noisyUtility(agent, b, rng) ? a.id : b.id;
}

export const agents: AgentProfile[] = [
    {
        name: 'hearty',
        values: { 'vibe:comfort': 1, 'richness:3': 0.8, 'richness:2': 0.3, 'temperature:hot': 0.5, 'vibe:healthy': -0.5 },
        likeThreshold: 0.8, superlikeThreshold: 1.7, noiseSd: 0.3, extends: false, probeEngages: true,
    },
    {
        name: 'fresh-light',
        values: { 'vibe:fresh': 1, 'vibe:healthy': 0.7, 'richness:1': 0.6, 'temperature:cold': 0.4, 'richness:3': -0.6 },
        likeThreshold: 0.8, superlikeThreshold: 1.7, noiseSd: 0.3, extends: false, probeEngages: true,
    },
    {
        name: 'spice-hound',
        values: { 'spice:3': 1.2, 'spice:2': 0.8, 'spice:0': -0.8, 'cuisine:thai': 0.3, 'cuisine:indian': 0.3 },
        likeThreshold: 0.7, superlikeThreshold: 1.5, noiseSd: 0.3, extends: true, probeEngages: true,
    },
    {
        name: 'picky',
        values: { 'cuisine:japanese': 1.2, 'cuisine:italian': 1.0, 'vibe:indulgent': 0.3 },
        likeThreshold: 0.9, superlikeThreshold: 1.5, noiseSd: 0.2, extends: true, probeEngages: true,
    },
    {
        name: 'anti-format',
        values: { 'primaryFormat:soup': -2, 'primaryFormat:stew': -2, 'primaryFormat:salad': -2, 'vibe:comfort': 0.6, 'temperature:hot': 0.4 },
        likeThreshold: 0.6, superlikeThreshold: 1.4, noiseSd: 0.3, extends: false, probeEngages: true,
    },
    {
        name: 'indifferent',
        values: {},
        likeThreshold: 0.25, superlikeThreshold: 1.2, noiseSd: 0.5, extends: true, probeEngages: true,
    },
    {
        name: 'refusenik',
        values: {},
        likeThreshold: 10, superlikeThreshold: 20, noiseSd: 0, extends: false, probeEngages: false,
    },
    {
        name: 'one-liker',
        // prawn-laksa is the deck's only malaysian dish — this agent likes exactly it.
        values: { 'cuisine:malaysian': 2 },
        likeThreshold: 1.5, superlikeThreshold: 5, noiseSd: 0.1, extends: true, probeEngages: true,
    },
];
