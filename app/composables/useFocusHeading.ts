import { nextTick, onMounted } from 'vue';

// Screen-reader flow (§9.12): each screen's heading receives focus when it appears.
export function useFocusHeading(headingRef: { value: HTMLElement | null }) {
    onMounted(async () => {
        await nextTick();
        headingRef.value?.focus();
    });
}
