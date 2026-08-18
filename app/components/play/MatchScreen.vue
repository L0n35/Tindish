<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Dish } from '#shared/types/dish';

const props = defineProps<{
    champion: Dish;
    runnerUp: Dish | null;
    usedRunnerUp: boolean;
    line: string;
}>();

defineEmits<{ sorted: []; runnerUp: [] }>();

const heading = ref<HTMLElement | null>(null);
useFocusHeading(heading);

const burst = computed(() => Array.from({ length: 12 }, (_, i) => ({
    emoji: ['✨', '🎉', '💫', '🧡'][i % 4]!,
    x: `${Math.cos((i / 12) * Math.PI * 2) * 90}px`,
    y: `${Math.sin((i / 12) * Math.PI * 2) * 70 - 40}px`,
    delay: `${i * 25}ms`,
})));
</script>

<template>
    <section data-testid="match-screen" class="flex flex-1 flex-col px-4 pb-6">
        <div class="relative mt-2 text-center">
            <h2 ref="heading" tabindex="-1" class="font-display text-3xl font-black text-tomato">It's a match</h2>
            <div class="pointer-events-none absolute inset-x-0 top-2 flex justify-center" aria-hidden="true">
                <span
                    v-for="(b, i) in burst"
                    :key="i"
                    class="absolute text-xl"
                    :style="{
                        animation: 'tindish-burst 900ms ease-out both',
                        animationDelay: b.delay,
                        '--burst-x': b.x,
                        '--burst-y': b.y,
                    }"
                >{{ b.emoji }}</span>
            </div>
        </div>
        <div
            class="mx-auto mt-4 w-full max-w-[300px]"
            style="animation: tindish-spring 500ms ease-out; --dish-art-max: calc(100dvh - 25rem)"
        >
            <CardSwipeCard :dish="champion" />
        </div>
        <!-- Keyed so promoting the runner-up crossfades to its new line. -->
        <Transition name="fade" mode="out-in">
            <p
                :key="line"
                data-testid="match-line"
                class="mx-auto mt-4 max-w-[34ch] text-center text-lg leading-snug text-char/80"
                style="transition: opacity 300ms"
            >{{ line }}</p>
        </Transition>
        <div class="mt-auto flex flex-col items-center gap-2 pt-6 pb-[env(safe-area-inset-bottom)]">
            <button
                type="button"
                data-testid="btn-sorted"
                class="min-h-13 w-full rounded-full bg-tomato py-4 font-display text-xl font-bold text-white shadow-lg active:scale-[0.98]"
                @click="$emit('sorted')"
            >
                Sorted
            </button>
            <!-- Quiet, once, and only when a final was played (§6.4). -->
            <button
                v-if="runnerUp !== null && !usedRunnerUp"
                type="button"
                data-testid="btn-runner-up"
                class="min-h-11 rounded-full px-4 py-2 text-sm text-char/70 active:underline"
                @click="$emit('runnerUp')"
            >
                Runner-up instead ({{ runnerUp.name }})
            </button>
        </div>
    </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 300ms ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
