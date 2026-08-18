<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { deckById } from '#shared/data/deck';
import { timeOfDayFromHour } from '#shared/utils/timeOfDay';
import type { Mode } from '#shared/types/dish';
import type { EffortFilter } from '#shared/types/session';
import type { HistoryRecord } from '#shared/types/records';

const store = useSessionStore();
const route = useRoute();

const mode = ref<Mode>('cooking');
// Quick-tonight deliberately resets each visit; only the mode toggle is remembered (§6.1).
const effortFilter = ref<EffortFilter>('noLimit');
const lastChampion = ref<HistoryRecord | null>(null);

onMounted(() => {
    store.launchSweep();
    const prefs = store.prefs.load();
    if (prefs) mode.value = prefs.mode;
    // The newest record whose champion still exists in the (possibly pruned) deck.
    lastChampion.value = store.history.load().find((r) => deckById.has(r.championId)) ?? null;
});

const championLine = computed(() => {
    const record = lastChampion.value;
    if (record === null) return null;
    const dish = deckById.get(record.championId);
    if (dish === undefined) return null;
    const when = new Date(record.ts);
    const weekday = when.toLocaleDateString('en-GB', { weekday: 'short' });
    return `Last champion: ${dish.name} ${dish.emoji} · ${weekday} ${timeOfDayFromHour(when.getHours())}`;
});

function newSeed(): number {
    const fromQuery = Number(route.query.seed);
    if (Number.isInteger(fromQuery) && fromQuery >= 0) return fromQuery >>> 0;
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0]!;
}

function dealMeIn(): void {
    store.prefs.save(mode.value, effortFilter.value);
    navigateTo({
        path: '/play',
        query: { new: '1', seed: String(newSeed()), mode: mode.value, effort: effortFilter.value },
    });
}
</script>

<template>
    <main class="flex flex-1 flex-col px-6 pb-8">
        <div class="flex flex-1 flex-col items-center justify-center text-center">
            <svg width="88" height="88" viewBox="0 0 72 72" aria-hidden="true">
                <circle cx="36" cy="36" r="30" fill="none" stroke="#46204E" stroke-width="3" />
                <circle cx="36" cy="36" r="22" fill="none" stroke="#46204E" stroke-width="1.5" opacity="0.5" />
                <path
                    d="M36 47 C30 42 25 38 25 32.5 C25 29 27.5 26.5 31 26.5 C33 26.5 35 27.6 36 29.4 C37 27.6 39 26.5 41 26.5 C44.5 26.5 47 29 47 32.5 C47 38 42 42 36 47 Z"
                    fill="#E23D28"
                />
            </svg>
            <h1 class="mt-3 font-display text-5xl font-black tracking-tight text-aubergine">Tindish</h1>
            <p class="mt-2 text-lg text-char/70">Stop deciding. Start eating.</p>
            <ClientOnly>
                <p v-if="championLine" class="mt-6 text-sm text-char/70" data-testid="last-champion">
                    {{ championLine }}
                </p>
            </ClientOnly>
        </div>

        <!-- Every primary action lives in the bottom 40% of the viewport (§9.1). -->
        <div class="flex flex-col gap-4 pb-[env(safe-area-inset-bottom)]">
            <HomeModeToggle :mode="mode" @update:mode="mode = $event" />
            <HomeEffortChips
                v-if="mode === 'cooking'"
                :effort-filter="effortFilter"
                @update:effort-filter="effortFilter = $event"
            />
            <button
                type="button"
                data-testid="home-cta"
                class="min-h-14 w-full rounded-full bg-tomato py-4 font-display text-xl font-bold text-white shadow-lg active:scale-[0.98]"
                @click="dealMeIn"
            >
                Deal me in
            </button>
        </div>
    </main>
</template>
