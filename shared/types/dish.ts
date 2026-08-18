export type Mode = 'cooking' | 'takeaway';

export type PrimaryFormat =
    | 'noodles' | 'rice' | 'bread' | 'soup' | 'salad' | 'pasta'
    | 'grill' | 'stew' | 'wrap' | 'pastry' | 'bowl';

export type Vibe = 'comfort' | 'fresh' | 'indulgent' | 'healthy';
export type Temperature = 'hot' | 'cold';
export type Richness = 1 | 2 | 3;
export type Spice = 0 | 1 | 2 | 3;
export interface DishTags {
    cuisine: string;
    protein: string;
    primaryFormat: PrimaryFormat;
    richness: Richness;
    temperature: Temperature;
    spice: Spice;
    vibe: Vibe;
}

export interface Dish {
    id: string;
    name: string;
    emoji: string;
    modes: Mode[];
    tags: DishTags;
}

export const SCORED_DIMENSIONS = [
    'cuisine', 'protein', 'primaryFormat', 'richness', 'temperature', 'spice', 'vibe',
] as const;

export type ScoredDimension = (typeof SCORED_DIMENSIONS)[number];
