import { expect, test } from '@playwright/test';
import { collect404s, dealIn, freshContext } from './helpers';

test('happy path: 4 yums → finalists → bracket → template match → Sorted → home history line, zero 404s', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const notFound = await collect404s(page);

    // Home: promise copy, CTA in the thumb zone (bottom 40% of the viewport).
    await page.goto('/');
    await expect(page.getByText('Stop deciding. Start eating.')).toBeVisible();
    const cta = page.getByTestId('home-cta');
    const box = (await cta.boundingBox())!;
    expect(box.y).toBeGreaterThan(667 * 0.6);

    // Reaction buttons meet the 44px touch-target floor with real spacing (§9.2).
    await dealIn(page, 2);
    for (const id of ['btn-nope', 'btn-yum', 'btn-omg'] as const) {
        const buttonBox = (await page.getByTestId(id).boundingBox())!;
        expect(buttonBox.width, id).toBeGreaterThanOrEqual(44);
        expect(buttonBox.height, id).toBeGreaterThanOrEqual(44);
    }
    const nopeBox = (await page.getByTestId('btn-nope').boundingBox())!;
    const yumBox = (await page.getByTestId('btn-yum').boundingBox())!;
    expect(yumBox.x - (nopeBox.x + nopeBox.width)).toBeGreaterThanOrEqual(16);

    // Four straight positives: pips fill 1..4 and the round stops instantly (§16.2).
    for (let i = 1; i <= 4; i++) {
        await page.getByTestId('btn-yum').click();
        if (i < 4) {
            await expect(page.getByTestId(`pip-${i}`)).toHaveAttribute('data-filled', 'true');
        }
    }
    await expect(page.getByTestId('finalists')).toBeVisible();
    await expect(page.getByText('Got it. Your finalists:')).toBeVisible();

    // Bracket: two semis then the final; labels whisper the round.
    await page.getByTestId('begin-bracket').click();
    await expect(page.getByTestId('bracket-label')).toHaveText(/semi-final/i);
    await page.getByTestId('bracket-card-a').click();
    await expect(page.getByTestId('bracket-label')).toHaveText(/semi-final/i);
    await page.getByTestId('bracket-card-b').click();
    await expect(page.getByTestId('bracket-label')).toHaveText(/the final/i);
    await page.getByTestId('bracket-card-a').click();

    // Match renders instantly from local state with the deterministic template line.
    await expect(page.getByTestId('match-screen')).toBeVisible();
    await expect(page.getByTestId('match-line')).not.toBeEmpty();
    const championName = (await page.getByTestId('card-name').textContent())!.trim();
    expect(championName.length).toBeGreaterThan(0);

    // The polite live region announced the match (§9.12).
    await expect(page.getByTestId('live-region')).toContainText("It's a match");

    // Runner-up control exists (a final was played).
    await expect(page.getByTestId('btn-runner-up')).toBeVisible();

    // Sorted → home shows the champion line.
    await page.getByTestId('btn-sorted').click();
    await page.waitForURL('**/');
    await expect(page.getByTestId('last-champion')).toContainText(championName);

    // Zero 404s across the whole flow with zero images shipped (§16.8).
    expect(notFound).toEqual([]);
});

test('runner-up promotion swaps the champion once and the history record reflects it', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    for (let i = 0; i < 4; i++) await page.getByTestId('btn-yum').click();
    await page.getByTestId('begin-bracket').click();
    await page.getByTestId('bracket-card-a').click();
    await page.getByTestId('bracket-card-a').click();
    await page.getByTestId('bracket-card-a').click();
    await expect(page.getByTestId('match-screen')).toBeVisible();

    const originalChampion = (await page.getByTestId('card-name').textContent())!.trim();
    const runnerUpButton = page.getByTestId('btn-runner-up');
    const runnerUpName = (await runnerUpButton.textContent())!.match(/\((.+)\)/)![1]!;
    await runnerUpButton.click();

    // Champion swapped; the control is gone (once only).
    await expect(page.getByTestId('card-name')).toHaveText(runnerUpName);
    await expect(page.getByTestId('btn-runner-up')).toHaveCount(0);

    await page.getByTestId('btn-sorted').click();
    await page.waitForURL('**/');
    await expect(page.getByTestId('last-champion')).toContainText(runnerUpName);
    expect(runnerUpName).not.toBe(originalChampion);
});

test('undo at the finalists reveal recovers a fat-thumbed fourth positive', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    for (let i = 0; i < 4; i++) await page.getByTestId('btn-yum').click();
    await expect(page.getByTestId('finalists')).toBeVisible();

    await page.getByTestId('undo').click();
    await expect(page.getByTestId('card-name')).toBeVisible();
    await expect(page.getByTestId('pip-4')).toHaveAttribute('data-filled', 'false');
    await expect(page.getByTestId('pip-3')).toHaveAttribute('data-filled', 'true');

    // Re-liking lands back at the same finalists.
    await page.getByTestId('btn-yum').click();
    await expect(page.getByTestId('finalists')).toBeVisible();
});

test('a real F5 mid-bracket restores the exact match position (?new=1 is stripped after start)', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    // The start flag must not survive into the session URL, or a reload would start over.
    expect(page.url()).not.toContain('new=1');

    for (let i = 0; i < 4; i++) await page.getByTestId('btn-yum').click();
    await page.getByTestId('begin-bracket').click();
    await page.getByTestId('bracket-card-a').click();
    await expect(page.getByTestId('bracket-label')).toHaveText(/semi-final/i);
    const secondSemiA = (await page.getByTestId('bracket-card-a').textContent())!.trim();

    await page.reload();   // genuine F5 — the exact gesture that used to destroy the session
    await expect(page.getByTestId('bracket-label')).toHaveText(/semi-final/i);
    expect((await page.getByTestId('bracket-card-a').textContent())!.trim()).toBe(secondSemiA);
});

test('a reload mid-swipe restores the same card and progress', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    await page.getByTestId('btn-yum').click();
    await page.getByTestId('btn-nope').click();
    const cardBefore = (await page.getByTestId('card-name').textContent())!.trim();

    await page.reload();
    await expect(page.getByTestId('card-name')).toHaveText(cardBefore);
    await expect(page.getByTestId('pip-1')).toHaveAttribute('data-filled', 'true');
    await expect(page.getByTestId('pip-2')).toHaveAttribute('data-filled', 'false');
});
