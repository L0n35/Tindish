import type { Page } from '@playwright/test';

// Fresh localStorage before any app code runs — once per tab, not on every navigation
// (init scripts re-run on every document load; an unguarded clear would wipe the active
// session an in-test reload is trying to restore).
export async function freshContext(page: Page): Promise<void> {
    await page.addInitScript(() => {
        try {
            if (!window.sessionStorage.getItem('__tindish_e2e_cleared')) {
                window.localStorage.clear();
                window.sessionStorage.setItem('__tindish_e2e_cleared', '1');
            }
        } catch { /* ignore */ }
    });
}

// Seed history records so historyFallback / the 24h penalty have data to work with.
// Records carry an empty event log — display paths never replay them.
export async function seedHistory(page: Page, championIds: string[], mode: 'cooking' | 'takeaway'): Promise<void> {
    await page.addInitScript(({ ids, historyMode }) => {
        if (window.sessionStorage.getItem('__tindish_e2e_seeded')) return;
        window.sessionStorage.setItem('__tindish_e2e_seeded', '1');
        const now = Date.now();
        const records = ids.map((championId: string, i: number) => ({
            sessionId: `seeded-${i}`,
            seed: i,
            engineVersion: 1,
            deckHash: 'seeded',
            tuningVersion: 1,
            events: [],
            mode: historyMode,
            dealerContext: { recentChampions: [], lastSessionShownIds: [], historyChampionIds: [] },
            startedAt: now - (i + 2) * 86_400_000,
            shownIds: [],
            championId,
            source: 'bracket',
            usedRunnerUp: false,
            ts: now - (i + 2) * 86_400_000,   // > 24h ago: no live penalty in the session under test
        }));
        window.localStorage.setItem('tindish:history:v1', JSON.stringify({ v: 1, records }));
    }, { ids: championIds, historyMode: mode });
}

export async function dealIn(page: Page, seed: number, mode: 'cooking' | 'takeaway' = 'takeaway'): Promise<void> {
    await page.goto(`/play?new=1&seed=${seed}&mode=${mode}`);
    await page.getByTestId('card-name').waitFor({ state: 'visible' });
}

export async function collect404s(page: Page): Promise<string[]> {
    const failures: string[] = [];
    page.on('response', (response) => {
        if (response.status() === 404) failures.push(response.url());
    });
    return failures;
}
