<script setup lang="ts">
const { message } = useLiveAnnouncer();
</script>

<template>
    <div aria-live="polite" class="sr-only" data-testid="live-region">{{ message }}</div>
</template>
