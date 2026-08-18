import type { Dish } from '#shared/types/dish';
import type { NarrateRequest } from '#shared/schemas/narrate';
import type { WeatherContext } from './weather';

export interface NarratePromptInput {
    request: NarrateRequest;
    champion: Dish;
    runnerUp: Dish | null;
    reactionDishes: { dish: Dish; reaction: string }[];
    weather: WeatherContext;
}

// The prompt is assembled exclusively from server-side deck data plus validated enums —
// ids come in, deck strings go out, so no client free text can ever reach the model.
export function buildNarratePrompt(input: NarratePromptInput): { system: string; user: string } {
    const system = [
        'You write the single celebratory line for Tindish, a private app that helps one decision-fatigued',
        'person choose dinner. She just crowned a dish HERSELF through swipes and a mini tournament.',
        'You narrate her choice back to her — you never select, rank, suggest alternatives, or second-guess.',
        'Voice: warm, confident, brief. No hedging, no questions, no exclamation spam.',
        'Return: profile — one line (max ~20 words) naming the craving her reactions reveal tonight;',
        'why — one short sentence connecting the crowned dish to that craving (and the weather or time',
        'of day only if provided). Never mention swiping mechanics, scores, apps, or data.',
    ].join(' ');

    const tagsOf = (dish: Dish) =>
        `${dish.tags.cuisine}, ${dish.tags.protein}, ${dish.tags.primaryFormat}, ${dish.tags.vibe},`
        + ` richness ${dish.tags.richness}/3, spice ${dish.tags.spice}/3, ${dish.tags.temperature}`;

    const lines: string[] = [
        `Mode: ${input.request.mode === 'cooking' ? 'cooking at home' : 'ordering takeaway'}.`,
        `Crowned champion: ${input.champion.name} (${tagsOf(input.champion)}).`,
    ];
    if (input.runnerUp !== null) {
        lines.push(`Beaten finalist: ${input.runnerUp.name}.`);
    }
    if (input.request.source === 'direct') {
        lines.push('It was the one dish that caught her eye tonight — no tournament needed.');
    }
    if (input.weather.weatherLine !== undefined) {
        lines.push(`Outside: ${input.weather.weatherLine}.`);
    }
    lines.push(`Time of day: ${input.weather.timeOfDay}.`);
    lines.push('Her reactions this session:');
    for (const { dish, reaction } of input.reactionDishes) {
        lines.push(`- ${dish.name}: ${reaction}`);
    }
    return { system, user: lines.join('\n') };
}
