import type { Dish } from '../types/dish';
import type { BracketState, BracketMatch, Reaction } from '../types/session';
import type { Tuning } from '../tuning';
import { predictedScore, type TagStats } from './scoring';

// Seeding order (§5.5): superlikes in superlike order → probePicks in pick order →
// likes ranked by predicted score from end-of-round stats; ties break by ascending id.
export function seedFinalists(args: {
    positives: readonly string[];
    superlikeOrder: readonly string[];
    reactions: readonly { dishId: string; reaction: Reaction }[];
    stats: TagStats;
    byId: ReadonlyMap<string, Dish>;
    tuning: Tuning;
}): string[] {
    const superlikes = args.superlikeOrder.filter((id) => args.positives.includes(id));
    const probePicks = args.reactions
        .filter((r) => r.reaction === 'probePick' && args.positives.includes(r.dishId))
        .map((r) => r.dishId);
    const taken = new Set([...superlikes, ...probePicks]);
    const likes = args.positives
        .filter((id) => !taken.has(id))
        .map((id) => ({ id, score: predictedScore(args.stats, args.byId.get(id)!, args.tuning) }))
        .sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1))
        .map((entry) => entry.id);
    return [...superlikes, ...probePicks, ...likes].slice(0, args.tuning.TARGET_POSITIVES);
}

export function createBracket(seeds: readonly string[]): BracketState {
    let matches: BracketMatch[];
    if (seeds.length === 4) {
        matches = [
            { a: seeds[0]!, b: seeds[3]!, label: 'semi1', winnerId: null },
            { a: seeds[1]!, b: seeds[2]!, label: 'semi2', winnerId: null },
            { a: null, b: null, label: 'final', winnerId: null },
        ];
    } else if (seeds.length === 3) {
        matches = [
            { a: seeds[1]!, b: seeds[2]!, label: 'semi1', winnerId: null },
            { a: seeds[0]!, b: null, label: 'final', winnerId: null },
        ];
    } else if (seeds.length === 2) {
        matches = [{ a: seeds[0]!, b: seeds[1]!, label: 'final', winnerId: null }];
    } else {
        throw new Error(`bracket requires 2-4 seeds, got ${seeds.length}`);
    }
    return { matches, currentMatchIndex: 0, complete: false, championId: null };
}

export function reportWinner(bracket: BracketState, matchIndex: number, winnerId: string): BracketState {
    if (bracket.complete) throw new Error('bracket already complete');
    if (matchIndex !== bracket.currentMatchIndex) {
        throw new Error(`expected match ${bracket.currentMatchIndex}, got ${matchIndex}`);
    }
    const match = bracket.matches[matchIndex]!;
    if (match.a === null || match.b === null) throw new Error('match slots not yet filled');
    if (winnerId !== match.a && winnerId !== match.b) throw new Error(`${winnerId} is not in this match`);

    const matches = bracket.matches.map((m, i) => (i === matchIndex ? { ...m, winnerId } : { ...m }));
    const finalIndex = matches.length - 1;
    if (matchIndex < finalIndex) {
        const final = matches[finalIndex]!;
        if (final.a === null) final.a = winnerId;
        else final.b = winnerId;
    }
    const complete = matchIndex === finalIndex;
    return {
        matches,
        currentMatchIndex: complete ? matchIndex : matchIndex + 1,
        complete,
        championId: complete ? winnerId : null,
    };
}

export function finalLoser(bracket: BracketState): string | null {
    if (!bracket.complete || bracket.championId === null) return null;
    const final = bracket.matches[bracket.matches.length - 1]!;
    return final.a === bracket.championId ? final.b : final.a;
}
