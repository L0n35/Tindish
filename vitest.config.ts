import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
            '~': fileURLToPath(new URL('./app', import.meta.url)),
        },
    },
    test: {
        include: ['tests/unit/**/*.spec.ts', 'tests/simulation/**/*.spec.ts'],
        environment: 'node',
    },
});
