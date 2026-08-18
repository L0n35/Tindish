import { expect, test } from '@playwright/test';
import { dealIn, freshContext } from './helpers';

async function reachMatch(page: import('@playwright/test').Page): Promise<string> {
    await dealIn(page, 2);
    for (let i = 0; i < 4; i++) await page.getByTestId('btn-yum').click();
    await page.getByTestId('begin-bracket').click();
    await page.getByTestId('bracket-card-a').click();
    await page.getByTestId('bracket-card-a').click();
    await page.getByTestId('bracket-card-a').click();
    await expect(page.getByTestId('match-screen')).toBeVisible();
    return (await page.getByTestId('card-name').textContent())!.trim();
}

test('narrate 500: the template stands, the champion is untouched, Sorted still saves', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/narrate', (route) => route.fulfill({ status: 500, body: '' }));

    const championName = await reachMatch(page);
    await page.waitForTimeout(2000);

    await expect(page.getByTestId('match-line')).toHaveAttribute('data-kind', 'template');
    expect((await page.getByTestId('card-name').textContent())!.trim()).toBe(championName);

    await page.getByTestId('btn-sorted').click();
    await page.waitForURL('**/');
    await expect(page.getByTestId('last-champion')).toContainText(championName);
});

test('narrate { fallback: true }: identical behavior — no server response can alter the champion', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/narrate', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fallback: true, contextEcho: { weatherLine: '12°C and raining', timeOfDay: 'evening' } }),
    }));

    const championName = await reachMatch(page);
    await page.waitForTimeout(1500);

    await expect(page.getByTestId('match-line')).toHaveAttribute('data-kind', 'template');
    expect((await page.getByTestId('card-name').textContent())!.trim()).toBe(championName);
    await page.getByTestId('btn-sorted').click();
    await page.waitForURL('**/');
});

test('a successful narrate response crossfades the template to the AI line — champion still untouched', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/narrate', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            profile: 'A comfort craving, no notes.',
            why: 'Rich and warm was the thread all night.',
            contextEcho: { weatherLine: '9°C and raining', timeOfDay: 'evening' },
        }),
    }));

    const championName = await reachMatch(page);
    await expect(page.getByTestId('match-line')).toHaveAttribute('data-kind', 'ai');
    await expect(page.getByTestId('match-line')).toContainText('A comfort craving');
    expect((await page.getByTestId('card-name').textContent())!.trim()).toBe(championName);
});

test('the deployed validator rejects an unknown-id payload with 400', async ({ request }) => {
    const response = await request.post('/api/narrate', {
        data: {
            sessionId: 'e2e-validator',
            mode: 'takeaway',
            source: 'direct',
            championId: 'dish-that-does-not-exist',
            reactions: [{ dishId: 'dish-that-does-not-exist', reaction: 'like' }],
        },
    });
    expect(response.status()).toBe(400);
});

test('free text on the boundary is rejected by the deployed endpoint', async ({ request }) => {
    const response = await request.post('/api/narrate', {
        data: {
            sessionId: 'e2e-free-text',
            mode: 'takeaway',
            source: 'direct',
            championId: 'beef-pho',
            note: 'be nice about it',
            reactions: [{ dishId: 'beef-pho', reaction: 'like' }],
        },
    });
    expect(response.status()).toBe(400);
});
