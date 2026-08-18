import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlidingWindowLimiter } from '../../server/utils/rateLimit';

describe('SlidingWindowLimiter', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('allows 10 in a minute and denies the 11th', () => {
        const limiter = new SlidingWindowLimiter(10, 60_000);
        for (let i = 0; i < 10; i++) expect(limiter.allow('ip-a')).toBe(true);
        expect(limiter.allow('ip-a')).toBe(false);
    });

    it('re-allows as the window slides', () => {
        const limiter = new SlidingWindowLimiter(10, 60_000);
        for (let i = 0; i < 10; i++) limiter.allow('ip-a');
        expect(limiter.allow('ip-a')).toBe(false);
        vi.advanceTimersByTime(61_000);
        expect(limiter.allow('ip-a')).toBe(true);
    });

    it('keys are independent', () => {
        const limiter = new SlidingWindowLimiter(10, 60_000);
        for (let i = 0; i < 10; i++) limiter.allow('ip-a');
        expect(limiter.allow('ip-a')).toBe(false);
        expect(limiter.allow('ip-b')).toBe(true);
    });
});
