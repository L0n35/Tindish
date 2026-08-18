<script setup lang="ts">
import { ref } from 'vue';
import type { Dish } from '#shared/types/dish';

defineProps<{ champions: Dish[] }>();
defineEmits<{ crown: [dishId: string]; restart: []; end: [] }>();

const heading = ref<HTMLElement | null>(null);
useFocusHeading(heading);
</script>

<template>
    <section data-testid="history-fallback" class="flex flex-1 flex-col px-4 pb-6">
        <template v-if="champions.length > 0">
            <h2 ref="heading" tabindex="-1" class="mb-4 mt-2 font-display text-2xl font-bold">
                Tonight's deck didn't land. An old favourite instead?
            </h2>
            <div class="flex flex-col gap-3">
                <button
                    v-for="dish in champions"
                    :key="dish.id"
                    type="button"
                    :data-testid="`history-champion-${dish.id}`"
                    :aria-label="`Crown past champion ${dish.name}`"
                    class="flex items-center gap-4 overflow-hidden rounded-2xl bg-cream-card p-3 text-left shadow-md ring-1 ring-char/10 active:scale-[0.98]"
                    @click="$emit('crown', dish.id)"
                >
                    <CardDishArt class="w-20 shrink-0 rounded-xl" :dish-id="dish.id" :name="dish.name" :emoji="dish.emoji" />
                    <span class="font-display text-lg font-bold leading-tight">{{ dish.name }}</span>
                </button>
            </div>
        </template>
        <template v-else>
            <h2 ref="heading" tabindex="-1" class="mb-3 mt-2 font-display text-2xl font-bold">
                Nothing landed tonight — and that's okay.
            </h2>
            <p class="text-char/70">
                No past champions to lean on yet. A fresh deal sometimes reads the mood better,
                or just close this and eat whatever feels easy.
            </p>
            <button
                type="button"
                data-testid="restart"
                class="mt-6 min-h-12 w-full rounded-full bg-tomato py-3.5 font-display text-xl font-bold text-white shadow-lg active:scale-[0.98]"
                @click="$emit('restart')"
            >
                Deal me in again
            </button>
        </template>
        <div class="mt-auto pt-6 pb-[env(safe-area-inset-bottom)]">
            <button
                type="button"
                data-testid="end-session"
                class="min-h-12 w-full rounded-full py-3 text-char/70 ring-1 ring-char/20 active:bg-char/5"
                @click="$emit('end')"
            >
                End session
            </button>
        </div>
    </section>
</template>
