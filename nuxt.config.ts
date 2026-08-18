import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
    compatibilityDate: '2026-08-01',
    css: ['~/assets/css/main.css'],
    vite: { plugins: [tailwindcss()] },
    typescript: { strict: true },
    routeRules: {
        '/play': { ssr: false },
        '/debug': { ssr: false },
    },
    app: {
        head: {
            htmlAttrs: { lang: 'en' },
            title: 'Tindish',
            meta: [
                { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
                { name: 'theme-color', content: '#46204E' },
                { name: 'apple-mobile-web-app-capable', content: 'yes' },
                { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
            ],
            link: [
                { rel: 'manifest', href: '/manifest.webmanifest' },
                { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
                { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
            ],
        },
    },
});
