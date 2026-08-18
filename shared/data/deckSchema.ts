import { z } from 'zod';
import type { Dish } from '../types/dish';

export const dishSchema = z.object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case id'),
    name: z.string().min(1),
    emoji: z.string().min(1),
    modes: z.array(z.enum(['cooking', 'takeaway'])).min(1),
    tags: z.object({
        cuisine: z.string().min(1),
        protein: z.string().min(1),
        primaryFormat: z.enum([
            'noodles', 'rice', 'bread', 'soup', 'salad', 'pasta', 'grill', 'stew', 'wrap', 'pastry', 'bowl',
        ]),
        richness: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        temperature: z.enum(['hot', 'cold']),
        spice: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        vibe: z.enum(['comfort', 'fresh', 'indulgent', 'healthy']),
    }).strict(),
}).strict();

export const deckSchema = z.array(dishSchema)
    .min(90).max(100)
    .refine((deck) => new Set(deck.map((d) => d.id)).size === deck.length, { message: 'dish ids must be unique' })
    .refine((deck) => deck.filter((d) => d.modes.includes('cooking')).length >= 60, { message: '>= 60 cooking dishes' })
    .refine((deck) => deck.filter((d) => d.modes.includes('takeaway')).length >= 60, { message: '>= 60 takeaway dishes' });

export type DishInput = z.input<typeof dishSchema>;
export function assertValidDeck(deck: readonly Dish[]): void {
    deckSchema.parse(deck);
}
