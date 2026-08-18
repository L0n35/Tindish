<script setup lang="ts">
defineProps<{
    dishName: string;
    omgCapped: boolean;
}>();

defineEmits<{
    nope: [];
    yum: [];
    omg: [];
}>();
</script>

<template>
    <!-- ≥44px targets with real spacing between the destructive/positive pair (§9.2) -->
    <div class="flex items-center justify-center gap-6">
        <button
            type="button"
            data-testid="btn-nope"
            :aria-label="`Nope: ${dishName}`"
            class="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl text-char shadow-md ring-1 ring-char/15 transition-transform active:scale-90"
            @click="$emit('nope')"
        >✕</button>
        <button
            type="button"
            data-testid="btn-omg"
            :aria-label="omgCapped ? `OMG unavailable, all used: ${dishName}` : `OMG: ${dishName}`"
            class="flex h-14 w-14 items-center justify-center rounded-full bg-white text-xl shadow-md ring-1 ring-char/15 transition-transform active:scale-90"
            :class="omgCapped ? 'opacity-45' : 'text-miso'"
            @click="$emit('omg')"
        >⭐</button>
        <button
            type="button"
            data-testid="btn-yum"
            :aria-label="`Yum: ${dishName}`"
            class="flex h-16 w-16 items-center justify-center rounded-full bg-tomato text-2xl text-white shadow-md transition-transform active:scale-90"
            @click="$emit('yum')"
        >♥</button>
    </div>
</template>
