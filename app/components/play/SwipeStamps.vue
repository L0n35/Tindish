<script setup lang="ts">
import type { SwipeIntent } from '~/composables/useSwipe';

defineProps<{ intent: SwipeIntent; strength: number }>();
</script>

<template>
    <!-- Words, never colour alone (§6.2 / §9.12) -->
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <span
            class="absolute right-4 top-6 rounded-lg border-4 border-char px-3 py-1 font-display text-3xl font-black tracking-widest text-char"
            style="transform: rotate(12deg)"
            :style="{ opacity: intent === 'nope' ? strength : 0 }"
        >NOPE</span>
        <span
            class="absolute left-4 top-6 rounded-lg border-4 border-tomato px-3 py-1 font-display text-3xl font-black tracking-widest text-tomato"
            style="transform: rotate(-12deg)"
            :style="{ opacity: intent === 'yum' ? strength : 0 }"
        >YUM</span>
        <span
            class="absolute left-1/2 top-10 -translate-x-1/2 rounded-lg border-4 border-miso px-3 py-1 font-display text-3xl font-black tracking-widest text-miso"
            style="transform: translateX(-50%) rotate(-6deg)"
            :style="{ opacity: intent === 'omg' ? strength : 0 }"
        >OMG</span>
    </div>
</template>
