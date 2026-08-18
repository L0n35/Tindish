import { useState } from '#app';

interface ImageManifest { dishes: string[] }

const warmed = new Set<string>();

// The runtime manifest is the single source of truth for photo presence: only listed ids
// ever produce an image request, so a zero-photo build fires zero 404s by construction.
export function useDishImages() {
    const manifest = useState<Set<string> | null>('dish-image-manifest', () => null);

    async function load(): Promise<void> {
        if (manifest.value !== null || import.meta.server) return;
        try {
            const data = await $fetch<ImageManifest>('/images/manifest.json');
            manifest.value = new Set(data.dishes ?? []);
        } catch {
            manifest.value = new Set();
        }
    }

    function srcFor(dishId: string): string | null {
        return manifest.value?.has(dishId) ? `/images/dishes/${dishId}.jpg` : null;
    }

    function preloadCandidates(dishIds: (string | null)[]): void {
        if (import.meta.server) return;
        const run = async () => {
            await load();   // first-card preloads must not race the manifest fetch
            for (const id of dishIds) {
                if (id === null || warmed.has(id)) continue;
                const src = srcFor(id);
                if (src === null) continue;
                warmed.add(id);
                new Image().src = src;
            }
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run);
        } else {
            window.setTimeout(run, 200);   // Safari lacks requestIdleCallback
        }
    }

    return { load, srcFor, preloadCandidates, ready: manifest };
}
