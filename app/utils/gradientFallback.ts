import { fnv1a32 } from '#shared/utils/hash';

// Deterministic fallback art: dish id → hue pair 40-120° apart, so every dish without a
// photo still gets a distinct, intentional-looking gradient.
export function gradientFor(dishId: string): string {
    const h = fnv1a32(dishId);
    const hue1 = h % 360;
    const hue2 = (hue1 + 40 + ((h >>> 9) % 80)) % 360;
    return `linear-gradient(135deg, hsl(${hue1} 68% 56%), hsl(${hue2} 62% 42%))`;
}
