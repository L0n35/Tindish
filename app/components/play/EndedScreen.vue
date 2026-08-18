<script setup lang="ts">
import { ref } from 'vue';

defineEmits<{ home: [] }>();

const heading = ref<HTMLElement | null>(null);
useFocusHeading(heading);
</script>

<template>
    <section data-testid="ended" class="flex flex-1 flex-col items-center justify-center px-4 pb-6 text-center">
        <h2 ref="heading" tabindex="-1" class="font-display text-2xl font-bold">Session closed.</h2>
        <p class="mt-2 max-w-[30ch] text-char/70">Nothing saved, nothing forced. Eat well anyway.</p>
        <button
            type="button"
            data-testid="back-home"
            class="mt-8 min-h-12 w-full rounded-full bg-char py-3.5 font-display text-lg font-bold text-oat active:scale-[0.98]"
            @click="$emit('home')"
        >
            Back home
        </button>
    </section>
</template>
