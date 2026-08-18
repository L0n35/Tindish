<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { swipe as swipeTuning } from '#shared/tuning';
import type { Dish } from '#shared/types/dish';

const props = defineProps<{
    dish: Dish;
    omgCapped: boolean;
    enabled: boolean;
}>();

const emit = defineEmits<{
    commit: [reaction: 'dislike' | 'like' | 'superlike', dishId: string];
    omgBlocked: [];
}>();

const enabledRef = computed(() => props.enabled);
const { buzz } = useHaptics();

// Captured when the drag starts: the deferred fly-out commit must name the card that was
// actually dragged, never "whatever card is current" 220ms later (mixed-input safety).
const draggedDishId = ref<string | null>(null);

const swipe = useSwipe({
    enabled: enabledRef,
    canSuperlike: () => !props.omgCapped,
    onCommit: (reaction) => {
        buzz();
        emit('commit', reaction, draggedDishId.value ?? props.dish.id);
    },
    onOmgBlocked: () => {
        buzz(20);
        emit('omgBlocked');
    },
});

const handlers = {
    ...swipe.handlers,
    pointerdown: (event: PointerEvent) => {
        draggedDishId.value = props.dish.id;
        swipe.handlers.pointerdown(event);
    },
};

const entering = ref(false);
watch(() => props.dish.id, () => {
    entering.value = true;
    window.setTimeout(() => { entering.value = false; }, swipeTuning.nextCardInMs);
});

const cardStyle = computed(() => {
    const settle = swipe.settling.value;
    if (settle === 'left' || settle === 'right' || settle === 'up') {
        const x = settle === 'left' ? '-130vw' : settle === 'right' ? '130vw' : '0';
        const y = settle === 'up' ? '-130vh' : '0';
        return {
            transform: `translate3d(${x}, ${y}, 0) rotate(${swipe.rotation.value * 2}deg)`,
            transition: `transform ${swipeTuning.flyOutMs}ms ease-in`,
            willChange: 'transform',
        };
    }
    if (settle === 'bounce') {
        return {
            transform: 'translate3d(0, 0, 0) rotate(0deg)',
            transition: `transform ${swipeTuning.springBackMs}ms cubic-bezier(0.2, 1.6, 0.4, 1)`,
        };
    }
    if (swipe.dragging.value) {
        return {
            transform: `translate3d(${swipe.dx.value}px, ${swipe.dy.value}px, 0) rotate(${swipe.rotation.value}deg)`,
            willChange: 'transform',
        };
    }
    return {
        transform: 'translate3d(0, 0, 0)',
        animation: entering.value ? `tindish-pop-in ${swipeTuning.nextCardInMs}ms ease-out` : undefined,
    };
});

// Keyboard parity lives at the page level (window listener in play.vue) so it works for
// keyboard-only users without requiring focus on this pointer surface.
</script>

<template>
    <div class="swipe-surface relative" style="overscroll-behavior: none">
        <!-- The card back peeks beneath: the next card depends on this swipe, so a
             face-up peek is impossible by design (§6.2). -->
        <CardBack class="absolute inset-x-3 top-3 -z-10 h-full" />
        <div
            :style="cardStyle"
            v-on="handlers"
        >
            <CardSwipeCard :dish="dish" />
            <PlaySwipeStamps :intent="swipe.intent.value" :strength="swipe.strength.value" />
        </div>
    </div>
</template>
