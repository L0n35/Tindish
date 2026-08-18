<script setup lang="ts">
import { defaultTuning } from '#shared/tuning';

const props = defineProps<{
    positives: number;
    cardsDealt: number;
}>();

const target = defaultTuning.TARGET_POSITIVES;
</script>

<template>
    <!-- Progress measures things she wants, not cards endured (§6.2). -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2" role="img" :aria-label="`${Math.min(positives, target)} of ${target} picks`">
            <span
                v-for="i in target"
                :key="i"
                :data-testid="`pip-${i}`"
                :data-filled="i <= positives ? 'true' : 'false'"
                class="h-3.5 w-3.5 rounded-full transition-colors duration-300"
                :class="i <= positives ? 'bg-tomato' : 'bg-char/15'"
            />
        </div>
        <span class="text-xs tabular-nums text-char/70">card {{ cardsDealt }}</span>
    </div>
</template>
