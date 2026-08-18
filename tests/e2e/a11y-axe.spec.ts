import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { dealIn, freshContext } from './helpers';

async function analyze(page: import('@playwright/test').Page) {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag21aa'])
        .analyze();
    return results.violations;
}

test('axe: home has no WCAG A/AA violations', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('home-cta')).toBeVisible();
    expect(await analyze(page)).toEqual([]);
});

test('axe: swipe round has no WCAG A/AA violations', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    expect(await analyze(page)).toEqual([]);
});

test('axe: bracket has no WCAG A/AA violations', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    for (let i = 0; i < 4; i++) await page.getByTestId('btn-yum').click();
    await page.getByTestId('begin-bracket').click();
    await expect(page.getByTestId('bracket-card-a')).toBeVisible();
    expect(await analyze(page)).toEqual([]);
});

test('axe: match screen has no WCAG A/AA violations', async ({ page }) => {
    await freshContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dealIn(page, 2);
    for (let i = 0; i < 4; i++) await page.getByTestId('btn-yum').click();
    await page.getByTestId('begin-bracket').click();
    await page.getByTestId('bracket-card-a').click();
    await page.getByTestId('bracket-card-a').click();
    await page.getByTestId('bracket-card-a').click();
    await expect(page.getByTestId('match-screen')).toBeVisible();
    expect(await analyze(page)).toEqual([]);
});
