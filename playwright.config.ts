import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 60_000,
    retries: process.env.CI ? 2 : 0,
    use: {
        baseURL: 'http://127.0.0.1:3210',
        trace: 'retain-on-failure',
    },
    projects: [{
        // Chromium required: the layout-shift PerformanceObserver entry type is Chromium-only.
        name: 'mobile-chromium',
        use: {
            browserName: 'chromium',
            viewport: { width: 375, height: 667 },   // §9.13 viewport floor
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
        },
    }],
    webServer: {
        // The test:e2e npm script builds first; running the built output directly avoids
        // shell chaining inside webServer on Windows.
        command: 'node .output/server/index.mjs',
        url: 'http://127.0.0.1:3210',
        env: {
            PORT: '3210',
            HOST: '127.0.0.1',
            NUXT_ANTHROPIC_API_KEY: '',   // no-key path: deterministic template narration
        },
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
    },
});
