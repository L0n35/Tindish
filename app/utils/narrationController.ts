import type { NarrateRequest, NarrateResponse } from '#shared/schemas/narrate';

export type NarrationLine =
    | { kind: 'template'; text: string }
    | { kind: 'ai'; profile: string; why: string };

export interface NarrationDeps {
    post(body: NarrateRequest, signal: AbortSignal): Promise<NarrateResponse>;
    patchHistoryWeather(sessionId: string, weatherLine: string): void;
    onLine(line: NarrationLine): void;
}

// Framework-free implementation of the §6.4 race rules:
// - "Sorted" before the response → the record is saved first; a late success patches
//   only weather.line by sessionId and never touches the UI.
// - Runner-up promotion → abort in-flight, emit the regenerated template, re-request once.
// - Leaving (dispose) → abort; all stragglers (attempt-token mismatch) are ignored.
// - Any failure or fallback → the template stands. The champion is never altered here.
export class NarrationController {
    private attempt = 0;
    private controller: AbortController | null = null;
    private sessionId: string | null = null;
    private stashedWeatherLine: string | undefined;
    private sortedFlag = false;
    private reRequested = false;
    private disposed = false;

    constructor(private readonly deps: NarrationDeps) {}

    start(req: NarrateRequest, templateText: string): void {
        this.sessionId = req.sessionId;
        this.deps.onLine({ kind: 'template', text: templateText });
        this.fire(req);
    }

    promoteRunnerUp(newReq: NarrateRequest, newTemplateText: string): void {
        this.controller?.abort();
        this.attempt++; // invalidate any straggler
        this.deps.onLine({ kind: 'template', text: newTemplateText });
        if (!this.reRequested) {
            this.reRequested = true;
            this.fire(newReq);
        }
    }

    sorted(): void {
        // Deliberately no abort: the in-flight request may still land purely to patch
        // the already-saved history record (matched by session id).
        this.sortedFlag = true;
    }

    weatherLineForSave(): string | undefined {
        return this.stashedWeatherLine;
    }

    dispose(): void {
        this.disposed = true;
        this.controller?.abort();
        this.attempt++;
    }

    private fire(req: NarrateRequest): void {
        const myAttempt = ++this.attempt;
        const mySessionId = req.sessionId;
        this.controller = new AbortController();
        this.deps.post(req, this.controller.signal).then((res) => {
            if (this.disposed || myAttempt !== this.attempt || mySessionId !== this.sessionId) return; // stale
            const weatherLine = res.contextEcho?.weatherLine;
            if (weatherLine !== undefined) {
                this.stashedWeatherLine = weatherLine;
                if (this.sortedFlag) this.deps.patchHistoryWeather(mySessionId, weatherLine);
            }
            if (res.fallback === true) return; // template stands
            if (!this.sortedFlag) this.deps.onLine({ kind: 'ai', profile: res.profile, why: res.why });
        }).catch(() => {
            // Abort or network failure: the template stands; no client retry (the server owns
            // the single transient retry).
        });
    }
}
