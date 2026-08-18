<script setup lang="ts">
import { ref } from 'vue';
import type { Dish } from '#shared/types/dish';

defineProps<{ dishes: Dish[] }>();
defineEmits<{ pick: [dishId: string]; none: [] }>();

const heading = ref<HTMLElement | null>(null);
useFocusHeading(heading);
</script>

<template>
    <section data-testid="probe-screen" class="flex flex-1 flex-col px-4 pb-6">
        <h2 ref="heading" tabindex="-1" class="mb-4 mt-2 font-display text-2xl font-bold">
            None of that landing. Any of these directions?
        </h2>
        <div class="grid grid-cols-2 gap-3">
            <button
                v-for="dish in dishes"
                :key="dish.id"
                type="button"
                :aria-label="`Try this direction: ${dish.name}`"
                class="overflow-hidden rounded-2xl bg-cream-card text-left shadow-md ring-1 ring-char/10 transition-transform active:scale-95"
                @click="$emit('pick', dish.id)"
            >
                <CardDishArt :dish-id="dish.id" :name="dish.name" :emoji="dish.emoji" />
                <span class="block px-3 py-2.5 font-display text-sm font-semibold leading-snug">{{ dish.name }}</span>
            </button>
        </div>
        <div class="mt-auto pt-6 pb-[env(safe-area-inset-bottom)]">
            <button
                type="button"
                data-testid="probe-none"
                class="min-h-12 w-full rounded-full py-3 text-char/70 ring-1 ring-char/20 active:bg-char/5"
                @click="$emit('none')"
            >
                None of these
            </button>
        </div>
    </section>
</template>
