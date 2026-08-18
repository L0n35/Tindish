<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Dish } from '#shared/types/dish';

const props = defineProps<{
    finalists: Dish[];
    undoDisabled: boolean;
}>();

defineEmits<{ begin: []; undo: [] }>();

const heading = ref<HTMLElement | null>(null);
useFocusHeading(heading);

const copy = computed(() => {
    switch (props.finalists.length) {
        case 4: return 'Got it. Your finalists:';
        case 3: return 'Got it. Three contenders:';
        default: return 'Got it. It comes down to two:';
    }
});
</script>

<template>
    <!-- Up to four finalists = two grid rows of squares; cap them so the reveal and
         its CTA always fit one viewport. -->
    <section
        data-testid="finalists"
        class="flex min-h-0 flex-1 flex-col px-4 pb-6"
        style="--dish-art-max: calc((100dvh - 20rem) / 2)"
    >
        <h2 ref="heading" tabindex="-1" class="mb-4 mt-2 font-display text-2xl font-bold">{{ copy }}</h2>
        <div class="grid grid-cols-2 gap-3">
            <div
                v-for="(dish, i) in finalists"
                :key="dish.id"
                class="overflow-hidden rounded-2xl bg-cream-card shadow-md ring-1 ring-char/10"
                :style="{
                    animation: `tindish-fan-in 400ms ease-out both`,
                    animationDelay: `${i * 60}ms`,
                    '--fan-rot': `${(i - finalists.length / 2) * 3}deg`,
                }"
            >
                <CardDishArt class="mx-auto" :dish-id="dish.id" :name="dish.name" :emoji="dish.emoji" />
                <span class="block px-3 py-2.5 font-display text-sm font-semibold leading-snug">{{ dish.name }}</span>
            </div>
        </div>
        <div class="mt-auto flex flex-col items-center gap-2 pt-6 pb-[env(safe-area-inset-bottom)]">
            <button
                type="button"
                data-testid="begin-bracket"
                class="min-h-12 w-full rounded-full bg-tomato py-3.5 font-display text-xl font-bold text-white shadow-lg active:scale-[0.98]"
                @click="$emit('begin')"
            >
                Let them fight
            </button>
            <!-- Undo survives the transition until the bracket's first tap (§6.2). -->
            <PlayUndoControl :disabled="undoDisabled" @undo="$emit('undo')" />
        </div>
    </section>
</template>
