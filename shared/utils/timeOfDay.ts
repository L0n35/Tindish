export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDayFromHour(hour: number): TimeOfDay {
    const h = ((hour % 24) + 24) % 24;
    if (h < 5) return 'night';
    if (h < 11) return 'morning';
    if (h < 17) return 'afternoon';
    if (h < 22) return 'evening';
    return 'night';
}
