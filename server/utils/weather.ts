import { timeOfDayFromHour, type TimeOfDay } from '#shared/utils/timeOfDay';

export interface WeatherContext {
    weatherLine?: string;
    timeOfDay: TimeOfDay;
}

interface OpenMeteoCurrent {
    temperature_2m: number;
    weather_code: number;
}

interface OpenMeteoResponse {
    current?: OpenMeteoCurrent;
    utc_offset_seconds?: number;
}

// WMO weather interpretation codes reduced to a phrase.
function phraseFor(code: number): string {
    if (code === 0) return 'clear';
    if (code <= 3) return 'partly cloudy';
    if (code <= 48) return 'foggy';
    if (code <= 67) return 'raining';
    if (code <= 77) return 'snowing';
    if (code <= 82) return 'raining';
    if (code <= 86) return 'snowing';
    return 'stormy';
}

let cache: { at: number; data: OpenMeteoResponse } | null = null;
const CACHE_TTL_MS = 30 * 60_000;

export function resetWeatherCache(): void {
    cache = null;
}

// Decorative and failure-tolerant: any failure omits the weather line and approximates
// the timezone from the configured longitude (~15° per hour) — never throws.
export async function getWeatherContext(cfg: { weatherLat: string; weatherLon: string }): Promise<WeatherContext> {
    const fallbackTimeOfDay = (): TimeOfDay => {
        const offsetHours = Math.round(Number(cfg.weatherLon || '0') / 15);
        return timeOfDayFromHour(new Date().getUTCHours() + offsetHours);
    };

    try {
        if (cache === null || Date.now() - cache.at > CACHE_TTL_MS) {
            // timezone=auto is load-bearing: without it Open-Meteo defaults to GMT (§7).
            const url = 'https://api.open-meteo.com/v1/forecast'
                + `?latitude=${encodeURIComponent(cfg.weatherLat)}`
                + `&longitude=${encodeURIComponent(cfg.weatherLon)}`
                + '&current=temperature_2m,weather_code&timezone=auto';
            const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (!response.ok) throw new Error(`open-meteo ${response.status}`);
            cache = { at: Date.now(), data: await response.json() as OpenMeteoResponse };
        }
        const { current, utc_offset_seconds } = cache.data;
        const localHour = new Date(Date.now() + (utc_offset_seconds ?? 0) * 1000).getUTCHours();
        const timeOfDay = timeOfDayFromHour(localHour);
        if (current === undefined) return { timeOfDay };
        return {
            weatherLine: `${Math.round(current.temperature_2m)}°C and ${phraseFor(current.weather_code)}`,
            timeOfDay,
        };
    } catch {
        return { timeOfDay: fallbackTimeOfDay() };
    }
}
