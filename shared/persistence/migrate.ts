import type { ZodType } from 'zod';

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export type Migration = (parsed: unknown) => unknown;

// Read discipline: parse + validate in a try/catch; on failure attempt a registered
// migration for the stored version; still failing → remove the key and return null.
// Never throws to callers — malformed or old data never crashes (§8). Registered
// migrations live next to the schemas (see historyMigrations / prefsMigrations).
export function loadVersioned<T>(
    storage: StorageLike,
    key: string,
    schema: ZodType<T>,
    migrations: Record<number, Migration> = {},
): T | null {
    let raw: string | null = null;
    try {
        raw = storage.getItem(key);
    } catch {
        return null;
    }
    if (raw === null) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        safeRemove(storage, key);
        return null;
    }

    const direct = schema.safeParse(parsed);
    if (direct.success) return direct.data;

    const version = (parsed as { v?: unknown } | null)?.v;
    if (typeof version === 'number' && migrations[version]) {
        try {
            const migrated = schema.safeParse(migrations[version]!(parsed));
            if (migrated.success) {
                saveVersioned(storage, key, migrated.data);
                return migrated.data;
            }
        } catch {
            // fall through to reset
        }
    }
    safeRemove(storage, key);
    return null;
}

export function saveVersioned(storage: StorageLike, key: string, value: unknown): void {
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // Quota or privacy-mode failure: persisting is best-effort; the session continues in memory.
    }
}

export function safeRemove(storage: StorageLike, key: string): void {
    try {
        storage.removeItem(key);
    } catch {
        // ignore
    }
}
