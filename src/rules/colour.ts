/**
 * Text on an accent colour (mockup 1): black or white, whichever contrasts more, by WCAG 2's relative
 * luminance and contrast ratio. The better of the two is at least 4.58:1 for any colour.
 */

/** "#7b4fd6" to [123, 79, 214]; null for anything that is not a six-digit hex colour. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Pure black, not the mockup's #0b0d14: that one falls to 4.42:1 on a mid-grey accent. */
export const DARK_TEXT = "#000000";
export const LIGHT_TEXT = "#ffffff";

/** The text colour for an accent: black or white, whichever contrasts more. */
export function textOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return LIGHT_TEXT;
  const l = luminance(rgb);
  return contrast(l, 0) > contrast(l, 1) ? DARK_TEXT : LIGHT_TEXT;
}
