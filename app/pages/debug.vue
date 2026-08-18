<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { MetricsRecord } from '#shared/types/records';

const store = useSessionStore();
const records = ref<MetricsRecord[]>([]);

onMounted(() => {
    store.launchSweep();   // abandoned sessions must read "abandoned" here, not "open"
    records.value = store.metrics.load();
});

function toggleEaten(sessionId: string): void {
    store.metrics.toggleEaten(sessionId);
    records.value = store.metrics.load();
}

function fmtTime(ms?: number): string {
    if (ms === undefined) return '—';
    return `${(ms / 1000).toFixed(0)}s`;
}

function fmtDate(ts: number): string {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
    <main class="flex-1 px-3 pb-8">
        <h1 class="my-4 font-display text-2xl font-bold">Field-test metrics</h1>
        <p class="mb-4 text-sm text-char/70">
            One row per session. Tap the eaten cell after you actually cooked or ordered the champion.
        </p>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                    <tr class="border-b border-char/20 text-xs uppercase tracking-wide text-char/70">
                        <th class="py-2 pr-3">started</th>
                        <th class="py-2 pr-3">dealer</th>
                        <th class="py-2 pr-3">ended via</th>
                        <th class="py-2 pr-3">cards</th>
                        <th class="py-2 pr-3">pos</th>
                        <th class="py-2 pr-3">omg</th>
                        <th class="py-2 pr-3">probes</th>
                        <th class="py-2 pr-3">ext</th>
                        <th class="py-2 pr-3">t→champ</th>
                        <th class="py-2">eaten</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="record in records"
                        :key="record.sessionId"
                        class="border-b border-char/10"
                        data-testid="debug-row"
                    >
                        <td class="py-2 pr-3 whitespace-nowrap">{{ fmtDate(record.startedAt) }}</td>
                        <td class="py-2 pr-3">{{ record.dealerMode }}</td>
                        <td class="py-2 pr-3">{{ record.endedVia ?? 'open' }}</td>
                        <td class="py-2 pr-3 tabular-nums">{{ record.cardsDealt }}</td>
                        <td class="py-2 pr-3 tabular-nums">{{ record.positives }}</td>
                        <td class="py-2 pr-3 tabular-nums">{{ record.superlikes }}</td>
                        <td class="py-2 pr-3 tabular-nums">{{ record.probesShown }}</td>
                        <td class="py-2 pr-3">{{ record.extensionUsed ? 'yes' : '—' }}</td>
                        <td class="py-2 pr-3 tabular-nums">{{ fmtTime(record.timeToChampionMs) }}</td>
                        <td class="py-2">
                            <button
                                type="button"
                                class="min-h-11 min-w-11 rounded-lg px-3 py-1 ring-1"
                                :class="record.eaten ? 'bg-miso/30 ring-miso font-semibold' : 'ring-char/20 text-char/70'"
                                :aria-label="`Toggle eaten for session started ${fmtDate(record.startedAt)}`"
                                @click="toggleEaten(record.sessionId)"
                            >
                                {{ record.eaten ? 'eaten' : 'not yet' }}
                            </button>
                        </td>
                    </tr>
                    <tr v-if="records.length === 0">
                        <td colspan="10" class="py-6 text-center text-char/70">No sessions yet.</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <NuxtLink to="/" class="mt-6 inline-block min-h-11 py-2 text-tomato underline-offset-2 hover:underline">
            ← Back home
        </NuxtLink>
    </main>
</template>
