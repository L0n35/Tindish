<script setup lang="ts">
import type { EffortFilter } from '#shared/types/session';

defineProps<{ effortFilter: EffortFilter }>();
defineEmits<{ 'update:effortFilter': [filter: EffortFilter] }>();
</script>

<template>
    <div role="group" aria-label="Effort filter" class="flex gap-2">
        <button
            type="button"
            data-testid="chip-quick"
            class="min-h-11 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors"
            :class="effortFilter === 'quick' ? 'bg-miso/25 text-char ring-miso' : 'text-char/70 ring-char/20'"
            :aria-pressed="effortFilter === 'quick'"
            @click="$emit('update:effortFilter', 'quick')"
        >
            Quick tonight
        </button>
        <button
            type="button"
            data-testid="chip-no-limit"
            class="min-h-11 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors"
            :class="effortFilter === 'noLimit' ? 'bg-miso/25 text-char ring-miso' : 'text-char/70 ring-char/20'"
            :aria-pressed="effortFilter === 'noLimit'"
            @click="$emit('update:effortFilter', 'noLimit')"
        >
            No limit
        </button>
    </div>
</template>
