import { computed, ref, type Ref } from 'vue';
import { swipe as swipeTuning } from '#shared/tuning';

export type SwipeIntent = 'nope' | 'yum' | 'omg' | null;
export type SwipeSettle = 'left' | 'right' | 'up' | 'bounce' | null;

export interface SwipeOptions {
    enabled: Ref<boolean>;
    canSuperlike(): boolean;
    onCommit(reaction: 'dislike' | 'like' | 'superlike'): void;
    onOmgBlocked(): void;
}

interface Sample { t: number; x: number; y: number }

export function useSwipe(options: SwipeOptions) {
    const dx = ref(0);
    const dy = ref(0);
    const dragging = ref(false);
    const settling = ref<SwipeSettle>(null);

    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let cardWidth = 320;
    let cardHeight = 420;
    const samples: Sample[] = [];

    const rotation = computed(() => {
        const raw = dx.value * swipeTuning.rotationPerPx;
        return Math.max(-swipeTuning.maxRotationDeg, Math.min(swipeTuning.maxRotationDeg, raw));
    });

    const intent = computed<SwipeIntent>(() => {
        const absX = Math.abs(dx.value);
        const absY = Math.abs(dy.value);
        const progress = Math.max(absX / cardWidth, absY / cardHeight);
        if (progress < swipeTuning.commitDistanceRatio * 0.15) return null;
        if (dy.value < 0 && absY > swipeTuning.upDominance * absX) return 'omg';
        return dx.value > 0 ? 'yum' : 'nope';
    });

    const strength = computed(() => {
        const absX = Math.abs(dx.value);
        const absY = Math.abs(dy.value);
        const commitDistance = intent.value === 'omg'
            ? cardHeight * swipeTuning.commitDistanceRatio
            : cardWidth * swipeTuning.commitDistanceRatio;
        const distance = intent.value === 'omg' ? absY : absX;
        return Math.max(0, Math.min(1, distance / commitDistance / swipeTuning.stampFullAt));
    });

    function reset(): void {
        dx.value = 0;
        dy.value = 0;
        dragging.value = false;
        pointerId = null;
        samples.length = 0;
    }

    function onPointerdown(event: PointerEvent): void {
        // Track exactly one pointer: a second finger falls through to the browser's
        // pinch-zoom (touch-action: pinch-zoom keeps two-finger zoom working).
        if (!options.enabled.value || pointerId !== null || settling.value !== null) return;
        pointerId = event.pointerId;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        cardWidth = rect.width || cardWidth;
        cardHeight = rect.height || cardHeight;
        startX = event.clientX;
        startY = event.clientY;
        dragging.value = true;
        samples.length = 0;
        samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
    }

    function onPointermove(event: PointerEvent): void {
        if (event.pointerId !== pointerId) return;
        // Zero layout reads here: dimensions were cached on pointerdown.
        dx.value = event.clientX - startX;
        dy.value = event.clientY - startY;
        samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
        if (samples.length > 5) samples.shift();
    }

    function velocityOver(axis: 'x' | 'y'): number {
        if (samples.length < 2) return 0;
        const first = samples[0]!;
        const last = samples[samples.length - 1]!;
        const dt = last.t - first.t;
        if (dt <= 0) return 0;
        return (last[axis] - first[axis]) / dt;
    }

    function settleBack(): void {
        settling.value = 'bounce';
        window.setTimeout(() => {
            settling.value = null;
            reset();
        }, swipeTuning.springBackMs);
    }

    function onPointerup(event: PointerEvent): void {
        if (event.pointerId !== pointerId) return;
        dragging.value = false;
        const currentIntent = intent.value;
        const absX = Math.abs(dx.value);
        const absY = Math.abs(dy.value);
        const distanceCommit = currentIntent === 'omg'
            ? absY >= cardHeight * swipeTuning.commitDistanceRatio
            : absX >= cardWidth * swipeTuning.commitDistanceRatio;
        // Velocity is SIGNED toward the intent direction: a fast flick back toward center
        // is a cancel, never a commit (yanking a card back must not swipe it).
        const velocity = currentIntent === 'omg'
            ? -velocityOver('y')
            : currentIntent === 'yum' ? velocityOver('x') : -velocityOver('x');
        const velocityCommit = velocity >= swipeTuning.commitVelocity;

        if (currentIntent === null || (!distanceCommit && !velocityCommit)) {
            settleBack();
            return;
        }
        if (currentIntent === 'omg' && !options.canSuperlike()) {
            options.onOmgBlocked();
            settleBack();
            return;
        }
        settling.value = currentIntent === 'omg' ? 'up' : currentIntent === 'yum' ? 'right' : 'left';
        window.setTimeout(() => {
            options.onCommit(currentIntent === 'omg' ? 'superlike' : currentIntent === 'yum' ? 'like' : 'dislike');
            settling.value = null;
            reset();
        }, swipeTuning.flyOutMs);
    }

    function onPointercancel(event: PointerEvent): void {
        if (event.pointerId !== pointerId) return;
        settleBack();
    }

    return {
        dx, dy, dragging, rotation, intent, strength, settling,
        handlers: {
            pointerdown: onPointerdown,
            pointermove: onPointermove,
            pointerup: onPointerup,
            pointercancel: onPointercancel,
        },
    };
}
