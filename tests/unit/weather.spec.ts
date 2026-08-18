import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWeatherContext, resetWeatherCache } from '../../server/utils/weather';

const cfg = { weatherLat: '51.4749', weatherLon: '-0.2010' };

function meteoResponse(temp: number, code: number, offsetSeconds = 0) {
    return {
        ok: true,
        json: () => Promise.resolve({
            current: { temperature_2m: temp, weather_code: code },
            utc_offset_seconds: offsetSeconds,
        }),
    } as Response;
}

describe('getWeatherContext', () => {
    beforeEach(() => {
        resetWeatherCache();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-17T18:30:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('maps WMO codes to phrases and rounds the temperature', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(meteoResponse(11.6, 61));
        const result = await getWeatherContext(cfg);
        expect(result.weatherLine).toBe('12°C and raining');
        expect(fetchSpy.mock.calls[0]![0]).toContain('timezone=auto');
    });

    it('computes local time-of-day from utc_offset_seconds', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(meteoResponse(20, 0, 7200)); // UTC+2
        const result = await getWeatherContext(cfg);
        expect(result.timeOfDay).toBe('evening'); // 18:30Z + 2h = 20:30 local
    });

    it('caches for ~30 minutes (a second call makes no fetch)', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(meteoResponse(20, 0));
        await getWeatherContext(cfg);
        await getWeatherContext(cfg);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(31 * 60_000);
        await getWeatherContext(cfg);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('on any failure omits the weather line and approximates time-of-day from longitude', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
        const tokyoish = await getWeatherContext({ weatherLat: '35', weatherLon: '139.7' }); // ≈ UTC+9
        expect(tokyoish.weatherLine).toBeUndefined();
        expect(tokyoish.timeOfDay).toBe('night'); // 18:30Z + 9h = 03:30 local
        const london = await getWeatherContext(cfg); // ≈ UTC+0
        expect(london.timeOfDay).toBe('evening');
    });

    it('a non-ok HTTP status degrades the same way, never throws', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
        const result = await getWeatherContext(cfg);
        expect(result.weatherLine).toBeUndefined();
        expect(result.timeOfDay).toBeDefined();
    });
});
