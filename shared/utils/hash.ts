export function fnv1a32(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function fnv1a32Hex(input: string): string {
    return fnv1a32(input).toString(16).padStart(8, '0');
}
