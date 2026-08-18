<script setup lang="ts">
// The card back is on screen constantly — a design moment, not a placeholder (§6.2).
// Pure inline SVG: deterministic, crisp at any DPR, zero image assets.
</script>

<template>
    <!-- No position class on the root: the caller must position it (SwipeStage passes
         `absolute`); a `relative` here would win the Tailwind order and put the back
         into normal flow, pushing the real card down. -->
    <div
        class="overflow-hidden rounded-[var(--radius-card)] bg-aubergine shadow-lg ring-1 ring-char/20"
        aria-hidden="true"
    >
        <svg class="absolute inset-0 h-full w-full opacity-[0.14]" aria-hidden="true">
            <defs>
                <pattern id="tindish-doodles" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
                    <g fill="none" stroke="#B58BC4" stroke-width="1.6" stroke-linecap="round">
                        <path d="M10 8 v14 M6 8 v6 M14 8 v6 M6 14 a4 4 0 0 0 8 0" />
                        <path d="M44 10 c-3 5 3 6 0 11 M50 10 c-3 5 3 6 0 11" />
                        <path d="M20 46 q6 -10 12 0 q-6 10 -12 0 M32 46 l6 -4" />
                        <circle cx="58" cy="52" r="7" />
                        <path d="M53 52 q5 -6 10 0 M53 55 q5 6 10 0" />
                    </g>
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#tindish-doodles)" />
        </svg>
        <div class="absolute inset-2.5 rounded-[1.2rem] border border-tomato/70" />
        <div class="relative flex h-full flex-col items-center justify-center gap-3 py-10">
            <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
                <circle cx="36" cy="36" r="30" fill="none" stroke="#EBA937" stroke-width="3" />
                <circle cx="36" cy="36" r="22" fill="none" stroke="#EBA937" stroke-width="1.5" opacity="0.6" />
                <path
                    d="M36 47 C30 42 25 38 25 32.5 C25 29 27.5 26.5 31 26.5 C33 26.5 35 27.6 36 29.4 C37 27.6 39 26.5 41 26.5 C44.5 26.5 47 29 47 32.5 C47 38 42 42 36 47 Z"
                    fill="#EBA937"
                />
            </svg>
            <span class="font-display text-xl font-bold tracking-wide text-oat/90">Tindish</span>
        </div>
        <div
            class="tindish-sheen pointer-events-none absolute -inset-y-8 w-1/3 bg-gradient-to-r from-transparent via-oat/10 to-transparent"
            style="animation: tindish-sheen 12s linear infinite"
        />
    </div>
</template>
