import { deckById } from '#shared/data/deck';
import { narrateRequestSchema, type NarrateResponse } from '#shared/schemas/narrate';
import { getWeatherContext } from '../utils/weather';
import { narrateLimiter } from '../utils/rateLimit';
import { buildNarratePrompt } from '../utils/narratePrompt';
import { narrateWithClaude, realNarrationClient } from '../utils/anthropic';

let noKeyNoted = false;

// Narrates only; never selects, ranks, or overrides — and is never called for history
// champions. Any failure degrades to { fallback: true }: the local template stands and
// the champion is untouchable by anything this route returns (§7).
export default defineEventHandler(async (event): Promise<NarrateResponse> => {
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
    if (!narrateLimiter.allow(ip)) {
        throw createError({ statusCode: 429, statusMessage: 'Too many requests' });
    }

    // A legitimate payload is a few KB; refuse oversized bodies before buffering them.
    const contentLength = Number(getHeader(event, 'content-length') ?? 0);
    if (contentLength > 32_768) {
        throw createError({ statusCode: 413, statusMessage: 'Payload too large' });
    }

    const body = await readBody(event);
    const parsed = narrateRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid narrate request' });
    }
    const request = parsed.data;

    const config = useRuntimeConfig(event);
    const weather = await getWeatherContext({
        weatherLat: config.weatherLat,
        weatherLon: config.weatherLon,
    });
    const contextEcho = { ...(weather.weatherLine !== undefined ? { weatherLine: weather.weatherLine } : {}), timeOfDay: weather.timeOfDay };

    if (!config.anthropicApiKey) {
        if (!noKeyNoted && import.meta.dev) {
            noKeyNoted = true;
            console.info('[tindish] narration: no NUXT_ANTHROPIC_API_KEY set — using local template lines');
        }
        return { fallback: true, contextEcho };
    }

    const prompt = buildNarratePrompt({
        request,
        champion: deckById.get(request.championId)!,
        runnerUp: request.runnerUpId !== undefined ? deckById.get(request.runnerUpId)! : null,
        reactionDishes: request.reactions.map((r) => ({ dish: deckById.get(r.dishId)!, reaction: r.reaction })),
        weather,
    });

    const result = await narrateWithClaude({
        client: realNarrationClient(config.anthropicApiKey),
        model: config.anthropicModel,
        system: prompt.system,
        user: prompt.user,
    });

    if (!result.ok) return { fallback: true, contextEcho };
    return { profile: result.profile, why: result.why, contextEcho };
});
