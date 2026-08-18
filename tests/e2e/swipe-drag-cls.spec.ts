import { expect, test } from '@playwright/test';
import { dealIn, freshContext } from './helpers';

// Gesture-time layout-shift measurement. Deliberately NO hadRecentInput filter: the
// standard web-vitals CLS definition excludes input-adjacent shifts, which is exactly
// what we need to measure here — a transform-only drag must not shift layout at all.
async function armLayoutShiftObserver(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => {
        (window as never as { __ls: number }).__ls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as PerformanceEntry[] & { value: number }[]) {
                (window as never as { __ls: number }).__ls += (entry as unknown as { value: number }).value;
            }
        }).observe({ type: 'layout-shift', buffered: false });
    });
}

test('a real pointer drag commits as YUM with ~zero layout shift during the gesture', async ({ page }) => {
    await freshContext(page);
    await dealIn(page, 7);

    const card = page.getByTestId('card-name');
    await armLayoutShiftObserver(page);

    const box = (await card.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Fast rightward flick: 14 small moves well past the velocity threshold.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) {
        await page.mouse.move(cx + i * 20, cy - i * 1.5);
    }
    await page.mouse.up();

    await expect(page.getByTestId('pip-1')).toHaveAttribute('data-filled', 'true');

    const layoutShift = await page.evaluate(() => (window as never as { __ls: number }).__ls);
    expect(layoutShift).toBeLessThan(0.01);
});

test('a flick-back-to-cancel never commits the swipe it was cancelling', async ({ page }) => {
    await freshContext(page);
    await dealIn(page, 7);
    const nameBefore = (await page.getByTestId('card-name').textContent())!.trim();

    const box = (await page.getByTestId('card-name').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Drift right past the intent threshold but under the commit distance...
    for (let i = 1; i <= 6; i++) {
        await page.mouse.move(cx + i * 10, cy);
        await page.waitForTimeout(40);
    }
    // ...then yank back toward center fast and release while still right of origin.
    for (let i = 0; i < 4; i++) {
        await page.mouse.move(cx + 60 - (i + 1) * 12, cy);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect((await page.getByTestId('card-name').textContent())!.trim()).toBe(nameBefore);
    await expect(page.getByTestId('pip-1')).toHaveAttribute('data-filled', 'false');
});

test('a sub-threshold drag springs back without committing', async ({ page }) => {
    await freshContext(page);
    await dealIn(page, 7);
    const nameBefore = (await page.getByTestId('card-name').textContent())!.trim();

    const box = (await page.getByTestId('card-name').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Slow, tiny nudge: under both the distance ratio and the velocity threshold.
    for (let i = 1; i <= 5; i++) {
        await page.mouse.move(cx + i * 4, cy);
        await page.waitForTimeout(60);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect((await page.getByTestId('card-name').textContent())!.trim()).toBe(nameBefore);
    await expect(page.getByTestId('pip-1')).toHaveAttribute('data-filled', 'false');
});

test('the 4th OMG bounces with the cap message; the card stays and the probe path remains healthy', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);

    await page.getByTestId('btn-omg').click();
    await page.getByTestId('btn-omg').click();
    await page.getByTestId('btn-omg').click();
    await expect(page.getByTestId('pip-3')).toHaveAttribute('data-filled', 'true');

    const nameBefore = (await page.getByTestId('card-name').textContent())!.trim();
    await page.getByTestId('btn-omg').click();
    await expect(page.getByTestId('omg-toast')).toContainText("You've used your OMGs");
    expect((await page.getByTestId('card-name').textContent())!.trim()).toBe(nameBefore);
    await expect(page.getByTestId('pip-4')).toHaveAttribute('data-filled', 'false');

    // The 3-OMGs-then-7-dislikes edge: the probe must remain fully usable (§16.4).
    for (let i = 0; i < 7; i++) await page.getByTestId('btn-nope').click();
    await expect(page.getByTestId('probe-screen')).toBeVisible();
    await page.getByTestId('probe-screen').locator('button').first().click();
    await expect(page.getByTestId('finalists')).toBeVisible();   // 3 OMGs + probePick = 4 positives
});
