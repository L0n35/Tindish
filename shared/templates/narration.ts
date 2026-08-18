import type { CrownSource } from '../types/session';
import type { TimeOfDay } from '../utils/timeOfDay';

export interface TemplateInput {
    dishName: string;
    source: CrownSource;
    topTags: { dimension: string; value: string }[];
    timeOfDay: TimeOfDay;
    pick: number; // 0..1 from a seeded rng — deterministic template choice, replay-stable
}

const timePhrase: Record<TimeOfDay, string> = {
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    night: 'late night',
};

const vibeWord: Record<string, string> = {
    comfort: 'Comfort',
    fresh: 'Something fresh',
    indulgent: 'Indulgence',
    healthy: 'The good stuff',
};

// Raw tag values are engine vocabulary, not copy — "spice:2" must never surface as "2".
const humanValue: Record<string, string> = {
    'spice:0': 'mild', 'spice:1': 'gently spiced', 'spice:2': 'spicy', 'spice:3': 'fiery',
    'richness:1': 'light', 'richness:2': 'hearty', 'richness:3': 'rich',
    'temperature:hot': 'hot', 'temperature:cold': 'cool',
    'primaryFormat:noodles': 'noodly', 'primaryFormat:rice': 'rice-bowl', 'primaryFormat:bread': 'bready',
    'primaryFormat:soup': 'brothy', 'primaryFormat:salad': 'crisp', 'primaryFormat:pasta': 'pasta',
    'primaryFormat:grill': 'grilled', 'primaryFormat:stew': 'slow-cooked', 'primaryFormat:wrap': 'hand-held',
    'primaryFormat:pastry': 'flaky', 'primaryFormat:bowl': 'bowl-food',
};

export function humanizeTag(tag: { dimension: string; value: string }): string {
    return humanValue[`${tag.dimension}:${tag.value}`] ?? tag.value;
}

// Tonight's weights say nothing true about an old favourite — history gets its own pool.
const historyPool: ((d: string, t: TimeOfDay) => string)[] = [
    (d) => `An old favourite answers the call. ${d} it is.`,
    (d) => `You've been here before — and it was good. ${d}.`,
    (d, t) => `No experiments this ${timePhrase[t]}. ${d} it is.`,
];

const taggedPool: ((d: string, t: TimeOfDay, word: string) => string)[] = [
    (d, t, word) => `${vibeWord[word] ?? cap(word)} won the ${timePhrase[t]} — ${d} was always going to happen.`,
    (d, t, word) => `A ${word} kind of ${timePhrase[t]}. ${d}.`,
    (d, _t, word) => `Tonight leans ${word}, and ${d} leans right back.`,
    (d, t, word) => `${cap(word)} was the thread all along. ${d} for the ${timePhrase[t]}.`,
];

const plainPool: ((d: string, t: TimeOfDay) => string)[] = [
    (d) => `${d}. No second-guessing.`,
    (d, t) => `The ${timePhrase[t]} sorted itself: ${d}.`,
    (d) => `It was ${d} from the first swipe.`,
    (d, t) => `Some ${timePhrase[t]}s just know what they want. ${d}.`,
];

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function pickFrom<T>(pool: T[], pick: number): T {
    const index = Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(pick, 0.999999)) * pool.length));
    return pool[index]!;
}

export function localNarration(input: TemplateInput): string {
    if (input.source === 'history') {
        return pickFrom(historyPool, input.pick)(input.dishName, input.timeOfDay);
    }
    const tag = input.topTags[0];
    if (tag !== undefined) {
        return pickFrom(taggedPool, input.pick)(input.dishName, input.timeOfDay, humanizeTag(tag));
    }
    return pickFrom(plainPool, input.pick)(input.dishName, input.timeOfDay);
}
