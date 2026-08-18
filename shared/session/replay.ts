import type { Dish } from '../types/dish';
import type { SessionConfig, SessionEnvelope, SessionState } from '../types/session';
import type { Tuning } from '../tuning';
import { ENGINE_VERSION } from '../engine/version';
import { hashDeck } from '../data/deckHash';
import { createEngineContext } from '../engine/dealer';
import { createInitialState, reduce } from './reducer';

export class ReplayVersionMismatchError extends Error {
    constructor(readonly field: 'engineVersion' | 'deckHash' | 'tuningVersion', expected: string | number, actual: string | number) {
        super(`envelope ${field} ${actual} does not match current ${expected}`);
        this.name = 'ReplayVersionMismatchError';
    }
}

export function configFromEnvelope(env: SessionEnvelope): SessionConfig {
    return {
        sessionId: env.sessionId,
        seed: env.seed,
        mode: env.mode,
        dealerContext: env.dealerContext,
        startedAt: env.startedAt,
    };
}

export function envelopeFor(config: SessionConfig, deck: readonly Dish[], tuning: Tuning): SessionEnvelope {
    return {
        v: 1,
        sessionId: config.sessionId,
        seed: config.seed,
        engineVersion: ENGINE_VERSION,
        deckHash: hashDeck(deck),
        tuningVersion: tuning.tuningVersion,
        mode: config.mode,
        dealerContext: config.dealerContext,
        startedAt: config.startedAt,
        events: [],
    };
}

// THE one replay path — used by the app on restore, by tests, and by the simulator.
export function replaySession(env: SessionEnvelope, deck: readonly Dish[], tuning: Tuning): SessionState {
    if (env.engineVersion !== ENGINE_VERSION) {
        throw new ReplayVersionMismatchError('engineVersion', ENGINE_VERSION, env.engineVersion);
    }
    const currentHash = hashDeck(deck);
    if (env.deckHash !== currentHash) {
        throw new ReplayVersionMismatchError('deckHash', currentHash, env.deckHash);
    }
    if (env.tuningVersion !== tuning.tuningVersion) {
        throw new ReplayVersionMismatchError('tuningVersion', tuning.tuningVersion, env.tuningVersion);
    }
    const ctx = createEngineContext(deck, tuning);
    let state = createInitialState(configFromEnvelope(env), ctx);
    for (const event of env.events) state = reduce(ctx, state, event);
    return state;
}
