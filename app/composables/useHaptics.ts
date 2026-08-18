// Progressive enhancement: iOS Safari lacks navigator.vibrate — the app must feel
// complete in total silence.
export function useHaptics() {
    function buzz(ms = 10): void {
        if (import.meta.client && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(ms);
        }
    }
    return { buzz };
}
