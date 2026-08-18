<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { gradientFor } from '~/utils/gradientFallback';

const props = defineProps<{
    dishId: string;
    name: string;
    emoji: string;
}>();

const { srcFor } = useDishImages();
const loaded = ref(false);
const src = computed(() => srcFor(props.dishId));
const gradient = computed(() => gradientFor(props.dishId));

// The component instance is reused across deals: a new dish means a new load cycle,
// or the previous dish's bitmap would show while the next one decodes.
watch(() => props.dishId, () => { loaded.value = false; });
</script>

<template>
    <div
        class="relative w-full overflow-hidden"
        style="aspect-ratio: 1 / 1"
        :style="src === null ? { background: gradient } : { background: 'var(--color-cream-card)' }"
    >
        <template v-if="src !== null">
            <div
                v-if="!loaded"
                class="absolute inset-0 bg-cream-card"
                style="animation: tindish-shimmer 1.4s ease-in-out infinite"
                aria-hidden="true"
            />
            <img
                :src="src"
                :alt="''"
                width="1024"
                height="1024"
                loading="eager"
                decoding="async"
                class="h-full w-full object-cover"
                @load="loaded = true"
            >
        </template>
        <div v-else class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span class="text-[6rem] leading-none drop-shadow-sm">{{ emoji }}</span>
        </div>
    </div>
</template>
