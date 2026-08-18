import { expect, test } from '@playwright/test';
import { dealIn, freshContext, seedHistory } from './helpers';

// Robust to either probe count: keep disliking, answer every probe with "None of these",
// and assert the destination screen rather than the exact path length.
async function dislikeToFallback(page: import('@playwright/test').Page): Promise<void> {
    for (let i = 0; i < 40; i++) {
        if (await page.getByTestId('history-fallback').isVisible().catch(() => false)) return;
        if (await page.getByTestId('probe-screen').isVisible().catch(() => false)) {
            await page.getByTestId('probe-none').click();
            continue;
        }
        const nope = page.getByTestId('btn-nope');
        if (await nope.isVisible().catch(() => false)) {
            await nope.click();
            continue;
        }
        await page.waitForTimeout(120);
    }
    await expect(page.getByTestId('history-fallback')).toBeVisible();
}

test('7 rejections → probe with copy and 4 distinct directions → none → history fallback (warm empty state)', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);

    // Exactly 7 consecutive dislikes trigger the first probe.
    for (let i = 0; i < 7; i++) {
        await page.getByTestId('btn-nope').click();
    }
    await expect(page.getByTestId('probe-screen')).toBeVisible();
    await expect(page.getByText('None of that landing. Any of these directions?')).toBeVisible();
    const names = await page.getByTestId('probe-screen').locator('span.font-display').allTextContents();
    expect(new Set(names.map((n) => n.trim())).size).toBe(4);

    await page.getByTestId('probe-none').click();
    await dislikeToFallback(page);

    // Fresh context ⇒ no history ⇒ the honest empty state with Restart + End.
    await expect(page.getByText("Nothing landed tonight — and that's okay.")).toBeVisible();
    await expect(page.getByTestId('restart')).toBeVisible();
    await page.getByTestId('end-session').click();
    await expect(page.getByTestId('ended')).toBeVisible();
    await page.getByTestId('back-home').click();
    await page.waitForURL('**/');
});

test('with seeded history: fallback offers 3 tap-to-crown champions, history template, no runner-up, zero narrate calls', async ({ page }) => {
    await freshContext(page);
    await seedHistory(page, ['prawn-laksa', 'beef-pho', 'chicken-burrito'], 'takeaway');
    await page.emulateMedia({ reducedMotion: 'reduce' });

    let narrateCalls = 0;
    await page.route('**/api/narrate', (route) => {
        narrateCalls++;
        return route.fulfill({ status: 500, body: '' });
    });

    await dealIn(page, 2);
    await dislikeToFallback(page);

    // Three past champions for this mode, newest first.
    await expect(page.getByTestId('history-champion-prawn-laksa')).toBeVisible();
    await expect(page.getByTestId('history-champion-beef-pho')).toBeVisible();
    await expect(page.getByTestId('history-champion-chicken-burrito')).toBeVisible();

    await page.getByTestId('history-champion-beef-pho').click();
    await expect(page.getByTestId('match-screen')).toBeVisible();
    await expect(page.getByTestId('card-name')).toHaveText('Beef pho');

    // Dedicated history template; never the AI line; no runner-up control.
    await expect(page.getByTestId('match-line')).toHaveAttribute('data-kind', 'template');
    await expect(page.getByTestId('btn-runner-up')).toHaveCount(0);

    await page.getByTestId('btn-sorted').click();
    await page.waitForURL('**/');

    // History champions never call the narrate API (§7).
    expect(narrateCalls).toBe(0);
});

test('probe pick counts as the positive it is: picking on the probe resumes dealing with a filled pip', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    for (let i = 0; i < 7; i++) await page.getByTestId('btn-nope').click();
    await expect(page.getByTestId('probe-screen')).toBeVisible();

    await page.getByTestId('probe-screen').locator('button').first().click();
    await expect(page.getByTestId('card-name')).toBeVisible();
    await expect(page.getByTestId('pip-1')).toHaveAttribute('data-filled', 'true');
});
