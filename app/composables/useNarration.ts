import { ref } from 'vue';
import { deckById } from '#shared/data/deck';
import { defaultTuning, RESERVED_NARRATION_INDEX } from '#shared/tuning';
import { deriveRng } from '#shared/engine/rng';
import { localNarration } from '#shared/templates/narration';
import { timeOfDayFromHour } from '#shared/utils/timeOfDay';
import { topPreferences, sessionReactions } from '#shared/session/selectors';
import type { NarrateRequest, NarrateResponse } from '#shared/schemas/narrate';
import type { SessionState } from '#shared/types/session';
import { NarrationController, type NarrationLine } from '~/utils/narrationController';

// Wires the framework-free NarrationController to the app: builds the strict request from
// reducer selectors, renders the replay-stable local template, and exposes the current line.
export function useNarration(deps: { patchHistoryWeather(sessionId: string, line: string): void }) {
    const line = ref<NarrationLine | null>(null);

    const controller = new NarrationController({
        post: (body, signal) => $fetch<NarrateResponse>('/api/narrate', { method: 'POST', body, signal }),
        patchHistoryWeather: deps.patchHistoryWeather,
        onLine: (next) => { line.value = next; },
    });

    function templateFor(state: SessionState, sessionId: string): string {
        const champion = deckById.get(state.championId!)!;
        // Template pick derives from a reserved decision index: replay-stable, and it can
        // never collide with (or perturb) a real dealer decision.
        const pick = deriveRng(state.config.seed, RESERVED_NARRATION_INDEX, state.usedRunnerUp ? 1 : 0)();
        return localNarration({
            dishName: champion.name,
            source: state.crownSource ?? 'bracket',
            topTags: state.crownSource === 'history' ? [] : topPreferences(state, defaultTuning, 2),
            timeOfDay: timeOfDayFromHour(new Date().getHours()),
            pick,
        });
    }

    function requestFor(state: SessionState, sessionId: string): NarrateRequest | null {
        if (state.crownSource !== 'bracket' && state.crownSource !== 'direct') return null;
        return {
            sessionId,
            mode: state.config.mode,
            source: state.crownSource,
            championId: state.championId!,
            ...(state.runnerUpId !== null ? { runnerUpId: state.runnerUpId } : {}),
            reactions: sessionReactions(state),
        };
    }

    function start(state: SessionState, sessionId: string): void {
        const template = templateFor(state, sessionId);
        const request = requestFor(state, sessionId);
        if (request === null) {
            // History champions never call the API — the dedicated template stands alone.
            line.value = { kind: 'template', text: template };
            return;
        }
        controller.start(request, template);
    }

    function promoteRunnerUp(state: SessionState, sessionId: string): void {
        const template = templateFor(state, sessionId);
        const request = requestFor(state, sessionId);
        if (request === null) {
            line.value = { kind: 'template', text: template };
            return;
        }
        controller.promoteRunnerUp(request, template);
    }

    return {
        line,
        start,
        promoteRunnerUp,
        sorted: () => controller.sorted(),
        weatherLineForSave: () => controller.weatherLineForSave(),
        dispose: () => controller.dispose(),
    };
}
