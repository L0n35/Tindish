<script setup lang="ts">
</script>

<template>
    <!-- h-dvh (not min-h): the app is a fixed viewport-height shell; no screen may
         ever require vertical scrolling. -->
    <div class="h-dvh bg-oat text-char">
        <div
            class="mx-auto flex h-full w-full max-w-[420px] flex-col"
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
