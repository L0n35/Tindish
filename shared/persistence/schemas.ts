import { z } from 'zod';
import type { Migration } from './migrate';

export const STORAGE_KEYS = {
    active: 'tindish:active:v1',
    history: 'tindish:history:v1',
    metrics: 'tindish:metrics:v1',
    prefs: 'tindish:prefs:v1',
} as const;

const modeSchema = z.enum(['cooking', 'takeaway']);
const crownSourceSchema = z.enum(['bracket', 'direct', 'history']);

export const sessionEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('swipe'), dishId: z.string(), reaction: z.enum(['like', 'dislike', 'superlike']) }).strict(),
    z.object({ type: z.literal('undo') }).strict(),
    z.object({ type: z.literal('probeShown'), dishIds: z.array(z.string()) }).strict(),
    z.object({ type: z.literal('probePick'), dishId: z.string() }).strict(),
    z.object({ type: z.literal('probeNone') }).strict(),
    z.object({ type: z.literal('extend') }).strict(),
    z.object({ type: z.literal('bracketPick'), matchIndex: z.number().int().nonnegative(), winnerId: z.string() }).strict(),
    z.object({ type: z.literal('crown'), dishId: z.string(), source: crownSourceSchema }).strict(),
    z.object({ type: z.literal('sorted') }).strict(),
    z.object({ type: z.literal('end') }).strict(),
]);

const dealerContextSchema = z.object({
    recentChampions: z.array(z.object({ dishId: z.string(), ts: z.number() }).strict()),
    lastSessionShownIds: z.array(z.string()),
    historyChampionIds: z.array(z.string()),
}).strict();

export const sessionEnvelopeSchema = z.object({
    v: z.literal(1),
    sessionId: z.string().min(1),
    seed: z.number().int().nonnegative(),
    engineVersion: z.number().int(),
    deckHash: z.string(),
    tuningVersion: z.number().int(),
    mode: modeSchema,
    dealerContext: dealerContextSchema,
    startedAt: z.number(),
    events: z.array(sessionEventSchema),
}).strict();

export const activeStoreSchema = z.object({
    v: z.literal(1),
    envelope: sessionEnvelopeSchema,
}).strict();

export const historyRecordSchema = z.object({
    sessionId: z.string().min(1),
    seed: z.number().int().nonnegative(),
    engineVersion: z.number().int(),
    deckHash: z.string(),
    tuningVersion: z.number().int(),
    events: z.array(sessionEventSchema),
    mode: modeSchema,
    dealerContext: dealerContextSchema,
    startedAt: z.number(),
    shownIds: z.array(z.string()),
    championId: z.string(),
    runnerUpId: z.string().optional(),
    source: crownSourceSchema,
    usedRunnerUp: z.boolean(),
    ts: z.number(),
}).strict();

export const historyStoreSchema = z.object({
    v: z.literal(1),
    records: z.array(historyRecordSchema),
}).strict();

export const metricsRecordSchema = z.object({
    sessionId: z.string().min(1),
    seed: z.number().int().nonnegative(),
    dealerMode: z.enum(['adaptive', 'shuffled']),
    startedAt: z.number(),
    endedAt: z.number().optional(),
    endedVia: z.enum(['bracket', 'direct', 'history', 'ended', 'abandoned']).optional(),
    cardsDealt: z.number().int().nonnegative(),
    positives: z.number().int().nonnegative(),
    superlikes: z.number().int().nonnegative(),
    probesShown: z.number().int().nonnegative(),
    extensionUsed: z.boolean(),
    timeToChampionMs: z.number().optional(),
    eaten: z.boolean().optional(),
}).strict();

export const metricsStoreSchema = z.object({
    v: z.literal(1),
    records: z.array(metricsRecordSchema),
}).strict();

export const prefsStoreSchema = z.object({
    v: z.literal(1),
    mode: modeSchema,
}).strict();

export type ActiveStore = z.infer<typeof activeStoreSchema>;
export type HistoryStore = z.infer<typeof historyStoreSchema>;
export type MetricsStore = z.infer<typeof metricsStoreSchema>;
export type PrefsStore = z.infer<typeof prefsStoreSchema>;

// v1 stores written before effort filtering and weather narration were removed carry
// extra keys the strict schemas now reject; these repairs strip them so loadVersioned
// re-saves the store instead of resetting it. The active-session store is deliberately
// unmigrated — a stale envelope is discarded by the engine/deck version guards anyway.
const stripKeys = (value: unknown, keys: string[]): unknown => {
    if (typeof value !== 'object' || value === null) return value;
    const rest = { ...(value as Record<string, unknown>) };
    for (const key of keys) delete rest[key];
    return rest;
};

export const historyMigrations: Record<number, Migration> = {
    1: (parsed) => {
        const store = parsed as { records?: unknown[] } | null;
        if (typeof store !== 'object' || store === null || !Array.isArray(store.records)) return parsed;
        return { ...store, records: store.records.map((r) => stripKeys(r, ['effortFilter', 'weather'])) };
    },
};

export const prefsMigrations: Record<number, Migration> = {
    1: (parsed) => stripKeys(parsed, ['effortFilter']),
};
