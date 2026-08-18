<script setup lang="ts">
import type { Mode } from '#shared/types/dish';

defineProps<{ mode: Mode }>();
defineEmits<{ 'update:mode': [mode: Mode] }>();
</script>

<template>
    <div
        data-testid="mode-toggle"
        role="group"
        aria-label="Session mode"
        class="grid grid-cols-2 gap-1 rounded-full bg-char/8 p-1"
    >
        <button
            type="button"
            data-testid="mode-cooking"
            class="min-h-12 rounded-full py-3 font-display text-base font-bold transition-colors"
            :class="mode === 'cooking' ? 'bg-aubergine text-oat shadow' : 'text-char/70'"
            :aria-pressed="mode === 'cooking'"
            @click="$emit('update:mode', 'cooking')"
        >
            Cooking
        </button>
        <button
            type="button"
            data-testid="mode-takeaway"
            class="min-h-12 rounded-full py-3 font-display text-base font-bold transition-colors"
            :class="mode === 'takeaway' ? 'bg-aubergine text-oat shadow' : 'text-char/70'"
            :aria-pressed="mode === 'takeaway'"
            @click="$emit('update:mode', 'takeaway')"
        >
            Takeaway
        </button>
    </div>
</template>
