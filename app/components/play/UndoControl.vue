<script setup lang="ts">
defineProps<{ disabled: boolean }>();
defineEmits<{ undo: [] }>();
</script>

<template>
    <button
        type="button"
        data-testid="undo"
        class="min-h-11 rounded-full px-4 py-2 text-sm text-char/70 underline-offset-2 transition-opacity"
        :class="disabled ? 'opacity-35' : 'hover:underline active:underline'"
        :disabled="disabled"
        @click="$emit('undo')"
    >
        Undo last swipe
    </button>
</template>
