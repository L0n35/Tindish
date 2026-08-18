// Best-effort in-memory sliding window — a courtesy speed bump only. Serverless
// instances don't share memory; real protection for a public deploy is platform-level
// (Vercel Deployment Protection / WAF rate limiting). Stated plainly in the README.
export class SlidingWindowLimiter {
    private readonly hits = new Map<string, number[]>();

    constructor(private readonly limit = 10, private readonly windowMs = 60_000) {}

    allow(key: string): boolean {
        const now = Date.now();
        const cutoff = now - this.windowMs;
        const stamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
        if (stamps.length >= this.limit) {
            this.hits.set(key, stamps);
            return false;
        }
        stamps.push(now);
        this.hits.set(key, stamps);
        if (this.hits.size > 1000) this.sweep(cutoff);
        // Spoofed X-Forwarded-For values can mint unlimited keys; cap the map outright
        // (fail-open — this limiter is a courtesy speed bump, not the protection layer).
        if (this.hits.size > 10_000) this.hits.clear();
        return true;
    }

    private sweep(cutoff: number): void {
        for (const [key, stamps] of this.hits) {
            const live = stamps.filter((t) => t > cutoff);
            if (live.length === 0) this.hits.delete(key);
            else this.hits.set(key, live);
        }
    }
}

export const narrateLimiter = new SlidingWindowLimiter(10, 60_000);
