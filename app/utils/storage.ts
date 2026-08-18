import type { StorageLike } from '#shared/persistence/migrate';

const memory = new Map<string, string>();

const memoryStorage: StorageLike = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
};

export function appStorage(): StorageLike {
    // Even the property ACCESS throws under blocked-cookies / denied-storage settings —
    // degrade to the in-memory fallback instead of crashing every page (§8).
    try {
        if (import.meta.client && typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch {
        // fall through
    }
    return memoryStorage;
}
