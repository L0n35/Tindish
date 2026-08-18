import { useState } from '#app';

// Feeds the singleton polite live region rendered in app.vue (§9.12).
// (Named useLiveAnnouncer because Nuxt ships a built-in useAnnouncer.)
export function useLiveAnnouncer() {
    const message = useState<string>('announcer', () => '');

    function announce(text: string): void {
        // Clear first so repeating the same text is still announced.
        message.value = '';
        if (import.meta.client) {
            window.setTimeout(() => { message.value = text; }, 30);
        } else {
            message.value = text;
        }
    }

    return { message, announce };
}
