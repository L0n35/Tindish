import { z } from 'zod';
import { defaultTuning } from '../tuning';
import { deckById } from '../data/deck';
import type { TimeOfDay } from '../utils/timeOfDay';

// The narrate boundary: strict schemas everywhere — no free-text field exists here, ever.
// Ids are validated against the deck; the server prompt is assembled exclusively from
// server-side deck data, so client strings can never reach the model.
const reactionEntrySchema = z.object({
    dishId: z.string().min(1),
    reaction: z.enum(['like', 'dislike', 'superlike', 'probePick']),
}).strict();

export const narrateRequestSchema = z.object({
    sessionId: z.string().min(1).max(64),
    mode: z.enum(['cooking', 'takeaway']),
    source: z.enum(['bracket', 'direct']),
    championId: z.string().min(1),
    runnerUpId: z.string().min(1).optional(),
    reactions: z.array(reactionEntrySchema).min(1).max(defaultTuning.MAX_SESSION_ACTIONS),
}).strict().superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const entry of value.reactions) {
        if (!deckById.has(entry.dishId)) {
            ctx.addIssue({ code: 'custom', message: `unknown dish ${entry.dishId}` });
        }
        if (seen.has(entry.dishId)) {
            ctx.addIssue({ code: 'custom', message: `duplicate dishId ${entry.dishId}` });
        }
        seen.add(entry.dishId);
    }
    const positive = (id: string) =>
        value.reactions.some((r) => r.dishId === id && r.reaction !== 'dislike');
    if (!deckById.has(value.championId) || !positive(value.championId)) {
        ctx.addIssue({ code: 'custom', message: 'championId must be a known dish with a positive reaction' });
    }
    if (value.runnerUpId !== undefined) {
        if (value.runnerUpId === value.championId) {
            ctx.addIssue({ code: 'custom', message: 'runnerUpId must differ from championId' });
        } else if (!deckById.has(value.runnerUpId) || !positive(value.runnerUpId)) {
            ctx.addIssue({ code: 'custom', message: 'runnerUpId must be a known dish with a positive reaction' });
        }
    }
});

export type NarrateRequest = z.infer<typeof narrateRequestSchema>;

export interface ContextEcho {
    weatherLine?: string;
    timeOfDay: TimeOfDay;
}

export type NarrateResponse =
    | { fallback: true; contextEcho?: ContextEcho }
    | { fallback?: false; profile: string; why: string; contextEcho: ContextEcho };
