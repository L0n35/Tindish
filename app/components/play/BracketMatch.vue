<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Dish } from '#shared/types/dish';
import type { BracketMatch } from '#shared/types/session';

const props = defineProps<{
    match: BracketMatch;
    dishA: Dish;
    dishB: Dish;
    showUndo?: boolean;
    undoDisabled?: boolean;
}>();

const emit = defineEmits<{ pick: [winnerId: string]; undo: [] }>();

const heading = ref<HTMLElement | null>(null);
useFocusHeading(heading);

const label = computed(() => (props.match.label === 'final' ? 'The final' : 'Semi-final'));
const picking = ref<string | null>(null);

watch(() => props.match, () => { picking.value = null; });

function pick(winnerId: string) {
    if (picking.value !== null) return;
    picking.value = winnerId;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
        emit('pick', winnerId);
    } else {
        window.setTimeout(() => emit('pick', winnerId), 240);
    }
}
</script>

<template>
    <section class="flex flex-1 flex-col px-4 pb-6">
        <h2
            ref="heading"
            tabindex="-1"
            data-testid="bracket-label"
            class="mb-3 mt-2 text-center font-display text-sm font-semibold uppercase tracking-[0.2em] text-char/70"
        >
            {{ label }}
        </h2>
        <div class="flex flex-1 flex-col justify-center gap-4">
            <button
                v-for="(dish, i) in [dishA, dishB]"
                :key="dish.id"
                type="button"
                :data-testid="i === 0 ? 'bracket-card-a' : 'bracket-card-b'"
                :aria-label="`Pick ${dish.name}`"
                class="flex items-center gap-4 overflow-hidden rounded-2xl bg-cream-card p-3 text-left shadow-md ring-1 ring-char/10 transition-all"
                :class="{
                    'scale-[1.03] ring-2 ring-tomato': picking === dish.id,
                    'translate-x-6 opacity-0': picking !== null && picking !== dish.id,
                    'active:scale-[0.98]': picking === null,
                }"
                @click="pick(dish.id)"
            >
                <CardDishArt class="w-28 shrink-0 rounded-xl" :dish-id="dish.id" :name="dish.name" :emoji="dish.emoji" />
                <span class="font-display text-xl font-bold leading-tight">{{ dish.name }}</span>
            </button>
        </div>
        <!-- Undo survives until the bracket's FIRST tap (§6.2) — shown only pre-first-pick. -->
        <div v-if="showUndo" class="flex justify-center pt-3 pb-[env(safe-area-inset-bottom)]">
            <PlayUndoControl :disabled="undoDisabled ?? true" @undo="$emit('undo')" />
        </div>
    </section>
</template>
