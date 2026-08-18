<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { deckById } from '#shared/data/deck';
import { previewNext, historyOffers, topPreferences } from '#shared/session/selectors';
import { extensionAvailable as extensionAvailableSelector } from '#shared/session/selectors';
import { defaultTuning, RESERVED_TEMPLATE_INDEX } from '#shared/tuning';
import { deriveRng } from '#shared/engine/rng';
import { localNarration } from '#shared/templates/narration';
import { timeOfDayFromHour } from '#shared/utils/timeOfDay';
import type { Dish, Mode } from '#shared/types/dish';
import type { SwipeReaction } from '#shared/types/session';

const store = useSessionStore();
const route = useRoute();
const images = useDishImages();
const { announce } = useLiveAnnouncer();

const state = store.state;
const ready = ref(false);
const bracketStarted = ref(false);
const omgToast = ref(false);
let omgToastTimer: number | undefined;

onMounted(() => {
    images.load();
    window.addEventListener('keydown', onWindowKeydown);
    if (route.query.new === '1') {
        const seed = Number(route.query.seed);
        const mode = (route.query.mode === 'takeaway' ? 'takeaway' : 'cooking') as Mode;
        store.startNew({
            seed: Number.isInteger(seed) && seed >= 0 ? seed >>> 0 : Math.floor(Math.random() * 0xffffffff),
            mode,
        });
        ready.value = true;
        // Strip ?new=1 so a mid-session reload restores instead of silently starting over —
        // without this, F5 / PWA relaunch would destroy the session (restore unreachable).
        window.history.replaceState(window.history.state, '', '/play');
        return;
    }
    if (store.restoreActive()) {
        ready.value = true;
        if (state.value?.phase === 'bracket') bracketStarted.value = true;
    } else {
        navigateTo('/');
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown);
});

// Keyboard parity for keyboard-only users (§9.7/§9.12): page-level so it needs no focus
// on the pointer surface. Same guards as the buttons.
function onWindowKeydown(event: KeyboardEvent): void {
    if (state.value?.phase !== 'swiping') return;
    if (event.key === 'ArrowLeft') commit('dislike');
    else if (event.key === 'ArrowRight') commit('like');
    else if (event.key === 'ArrowUp') commit('superlike');
}

const currentDish = computed(() => store.currentDish.value);
const omgCapped = computed(() => (state.value?.omgUsed ?? 0) >= defaultTuning.OMG_CAP);

const probeDishes = computed<Dish[]>(() =>
    (state.value?.probe?.dishIds ?? []).map((id) => deckById.get(id)!).filter(Boolean));

const finalistDishes = computed<Dish[]>(() =>
    (state.value?.finalists ?? []).map((id) => deckById.get(id)!).filter(Boolean));

const currentMatch = computed(() => {
    const bracket = state.value?.bracket;
    if (!bracket || bracket.complete) return null;
    return bracket.matches[bracket.currentMatchIndex] ?? null;
});

const champion = computed(() => {
    const id = state.value?.championId;
    return id ? deckById.get(id) ?? null : null;
});

const runnerUp = computed(() => {
    const id = state.value?.runnerUpId;
    return id ? deckById.get(id) ?? null : null;
});

const historyChampions = computed<Dish[]>(() => {
    const s = state.value;
    if (s === null) return [];
    return historyOffers(s, defaultTuning).map((id) => deckById.get(id)!).filter(Boolean);
});

const extendAvailable = computed(() =>
    state.value !== null && extensionAvailableSelector(store.ctx, state.value));

// The match line, rendered instantly and deterministically from session state. The rng
// pick is replay-stable (reserved index, keyed on the runner-up branch), so the same
// session always narrates the same way; only the time-of-day phrase follows the clock.
const matchLine = computed<string>(() => {
    const s = state.value;
    if (s === null || s.championId === null || s.crownSource === null) return '';
    const pick = deriveRng(s.config.seed, RESERVED_TEMPLATE_INDEX, s.usedRunnerUp ? 1 : 0)();
    return localNarration({
        dishName: deckById.get(s.championId)?.name ?? s.championId,
        source: s.crownSource,
        topTags: s.crownSource === 'history' ? [] : topPreferences(s, defaultTuning, 2),
        timeOfDay: timeOfDayFromHour(new Date().getHours()),
        pick,
    });
});

// Preload the three candidate next cards during idle — correct because previews exactly
// predict the real next deal (§3.3 / §9.9).
watch(() => [state.value?.phase, state.value?.currentCard] as const, ([phase, card]) => {
    const s = state.value;
    if (s === null || phase !== 'swiping' || !card) return;
    const candidates = (['dislike', 'like', 'superlike'] as SwipeReaction[]).map((reaction) => {
        const outcome = previewNext(store.ctx, s, reaction);
        return outcome.kind === 'card' ? outcome.dishId : null;
    });
    images.preloadCandidates(candidates);
}, { immediate: true });

function commit(reaction: SwipeReaction, dishId?: string): void {
    const s = state.value;
    if (s === null || s.phase !== 'swiping' || s.currentCard === null) return;
    // A deferred gesture commit names the card that was dragged; if another input already
    // swiped it away, the stale gesture is dropped rather than landing on an unseen card.
    if (dishId !== undefined && dishId !== s.currentCard) return;
    if (reaction === 'superlike' && omgCapped.value) {
        blockOmg();
        return;
    }
    store.dispatch({ type: 'swipe', dishId: s.currentCard, reaction });
    if (state.value?.phase === 'finalists') {
        announce(`Finalists ready: ${finalistDishes.value.map((d) => d.name).join(', ')}`);
    } else if (state.value?.phase === 'probe') {
        announce('New directions to try');
    }
}

function blockOmg(): void {
    omgToast.value = true;
    announce("You've used your OMGs");
    window.clearTimeout(omgToastTimer);
    omgToastTimer = window.setTimeout(() => { omgToast.value = false; }, 1800);
}

function undo(): void {
    if (!store.undoDisabled.value) store.dispatch({ type: 'undo' });
}

function pickBracket(winnerId: string): void {
    const s = state.value;
    const bracket = s?.bracket;
    if (!s || !bracket) return;
    const matchIndex = bracket.currentMatchIndex;
    const isFinal = matchIndex === bracket.matches.length - 1;
    store.dispatch({ type: 'bracketPick', matchIndex, winnerId });
    const winnerName = deckById.get(winnerId)?.name ?? winnerId;
    if (isFinal) {
        // The final tap crowns atomically: two log entries, one gesture (§ plan).
        store.dispatch({ type: 'crown', dishId: winnerId, source: 'bracket' });
        announce(`It's a match: ${winnerName}`);
    } else {
        announce(`${winnerName} wins the semi-final`);
    }
}

function crownDirect(): void {
    const s = state.value;
    if (s === null || s.positives.length !== 1) return;
    store.dispatch({ type: 'crown', dishId: s.positives[0]!, source: 'direct' });
    announce(`It's a match: ${deckById.get(s.positives[0]!)?.name}`);
}

function crownHistory(dishId: string): void {
    store.dispatch({ type: 'crown', dishId, source: 'history' });
    announce(`It's a match: ${deckById.get(dishId)?.name}`);
}

function promoteRunnerUp(): void {
    const s = state.value;
    if (s === null || s.runnerUpId === null || s.usedRunnerUp) return;
    store.dispatch({ type: 'crown', dishId: s.runnerUpId, source: 'bracket' });
    announce(`Champion changed to ${champion.value?.name}`);
}

function sorted(): void {
    store.saveAndFinish();
    store.leaveToHome();
    navigateTo('/');
}

function endSession(): void {
    store.endSession();
}

function restart(): void {
    store.endSession();
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const s = state.value;
    store.startNew({
        seed: buffer[0]!,
        mode: (s?.config.mode ?? 'cooking') as Mode,
    });
    bracketStarted.value = false;
}

function goHome(): void {
    store.leaveToHome();
    navigateTo('/');
}
</script>

<template>
    <main class="flex min-h-0 flex-1 flex-col pt-2">
        <template v-if="!ready || state === null">
            <div class="flex flex-1 items-center justify-center text-char/70" data-testid="restoring">
                Setting the table…
            </div>
        </template>

        <template v-else-if="state.phase === 'swiping' && currentDish !== null">
            <!-- Cap the card art so pips + card + reactions always fit one viewport;
                 18rem ≈ everything on this screen that isn't the square image. -->
            <div class="flex min-h-0 flex-1 flex-col px-4 pb-4" style="--dish-art-max: calc(100dvh - 18rem)">
                <PlayPositivePips :positives="state.positives.length" :cards-dealt="state.cardsDealt" />
                <div class="relative mt-3 flex-1">
                    <PlaySwipeStage
                        :dish="currentDish"
                        :omg-capped="omgCapped"
                        :enabled="true"
                        @commit="commit"
                        @omg-blocked="blockOmg"
                    />
                    <div
                        v-if="omgToast"
                        data-testid="omg-toast"
                        class="absolute inset-x-6 top-3 rounded-full bg-char px-4 py-2 text-center text-sm font-semibold text-oat shadow-lg"
                        role="status"
                    >
                        You've used your OMGs
                    </div>
                </div>
                <!-- Bottom 40%: reactions, then the quiet undo (§9.1) -->
                <div class="mt-4 flex flex-col items-center gap-1 pb-[env(safe-area-inset-bottom)]">
                    <PlayReactionButtons
                        :dish-name="currentDish.name"
                        :omg-capped="omgCapped"
                        @nope="commit('dislike')"
                        @yum="commit('like')"
                        @omg="commit('superlike')"
                    />
                    <PlayUndoControl :disabled="store.undoDisabled.value" @undo="undo" />
                </div>
            </div>
        </template>

        <template v-else-if="state.phase === 'probe' && probeDishes.length > 0">
            <PlayProbeScreen
                :dishes="probeDishes"
                @pick="(id) => store.dispatch({ type: 'probePick', dishId: id })"
                @none="store.dispatch({ type: 'probeNone' })"
            />
        </template>

        <template v-else-if="state.phase === 'finalists' && !bracketStarted">
            <PlayFinalistsReveal
                :finalists="finalistDishes"
                :undo-disabled="store.undoDisabled.value"
                @begin="bracketStarted = true"
                @undo="undo"
            />
        </template>

        <template v-else-if="(state.phase === 'finalists' || state.phase === 'bracket') && currentMatch !== null">
            <PlayBracketMatch
                :match="currentMatch"
                :dish-a="deckById.get(currentMatch.a!)!"
                :dish-b="deckById.get(currentMatch.b!)!"
                :show-undo="state.phase === 'finalists'"
                :undo-disabled="store.undoDisabled.value"
                @pick="pickBracket"
                @undo="undo"
            />
        </template>

        <template v-else-if="state.phase === 'directOffer' && state.positives.length === 1">
            <PlayDirectOffer
                :dish="deckById.get(state.positives[0]!)!"
                :extend-available="extendAvailable"
                @crown="crownDirect"
                @extend="store.dispatch({ type: 'extend' })"
                @end="endSession"
            />
        </template>

        <template v-else-if="state.phase === 'historyFallback'">
            <PlayHistoryFallback
                :champions="historyChampions"
                @crown="crownHistory"
                @restart="restart"
                @end="endSession"
            />
        </template>

        <template v-else-if="state.phase === 'match' && champion !== null">
            <PlayMatchScreen
                :champion="champion"
                :runner-up="runnerUp"
                :used-runner-up="state.usedRunnerUp"
                :line="matchLine"
                @sorted="sorted"
                @runner-up="promoteRunnerUp"
            />
        </template>

        <template v-else-if="state.phase === 'ended'">
            <PlayEndedScreen @home="goHome" />
        </template>
    </main>
</template>
