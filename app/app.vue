<script setup lang="ts">
</script>

<template>
    <div class="min-h-dvh bg-oat text-char">
        <div
            class="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col"
            :style="{
                paddingTop: 'env(safe-area-inset-top)',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }"
        >
            <NuxtPage />
        </div>
        <UiLiveRegion />
    </div>
</template>
