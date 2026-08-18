<script setup lang="ts">
import { ref } from 'vue';
import type { Dish } from '#shared/types/dish';

defineProps<{
    dish: Dish;
    extendAvailable: boolean;
}>();

defineEmits<{ crown: []; extend: []; end: [] }>();

const heading = ref<HTMLElement | null>(null);
useFocusHeading(heading);
</script>

<template>
    <section data-testid="direct-offer" class="flex flex-1 flex-col px-4 pb-6">
        <h2 ref="heading" tabindex="-1" class="mb-4 mt-2 font-display text-2xl font-bold">
            This one caught your eye. Run with it?
        </h2>
        <div class="mx-auto w-full max-w-[300px]">
            <CardSwipeCard :dish="dish" />
        </div>
        <div class="mt-auto flex flex-col gap-3 pt-6 pb-[env(safe-area-inset-bottom)]">
            <button
                type="button"
                data-testid="crown-direct"
                class="min-h-12 w-full rounded-full bg-tomato py-3.5 font-display text-xl font-bold text-white shadow-lg active:scale-[0.98]"
                @click="$emit('crown')"
            >
                Crown it
            </button>
            <button
                v-if="extendAvailable"
                type="button"
                data-testid="extend"
                class="min-h-12 w-full rounded-full py-3 text-char/70 ring-1 ring-char/25 active:bg-char/5"
                @click="$emit('extend')"
            >
                Deal 6 more cards
            </button>
            <button
                v-else
                type="button"
                data-testid="offer-end"
                class="min-h-12 w-full rounded-full py-3 text-char/70 ring-1 ring-char/20 active:bg-char/5"
                @click="$emit('end')"
            >
                End session
            </button>
        </div>
    </section>
</template>
