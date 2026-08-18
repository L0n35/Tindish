import type { Dish } from '../types/dish';
import { fnv1a32Hex } from '../utils/hash';

function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value as Record<string, unknown>)
                .sort()
                .map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])]),
        );
    }
    return value;
}

export function hashDeck(deck: readonly Dish[]): string {
    const canonical = [...deck].sort((a, b) => (a.id < b.id ? -1 : 1)).map(sortKeysDeep);
    return fnv1a32Hex(JSON.stringify(canonical));
}
