/**
 * Arial advance widths in 1/1000 em (Arial is metric-compatible with Helvetica).
 * Worship teams line chords up over lyrics by eye in Google Docs / Word, which use Arial
 * by default, so a chord's place is a horizontal distance, not a character count:
 * over UPPERCASE lyrics a run of narrow spaces reaches much less far than the same
 * number of letters.
 */
const WIDTHS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584,
  '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333, '{': 334,
  '|': 260, '}': 334, '~': 584,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '\u2018': 222, '\u2019': 222, '\u201C': 333, '\u201D': 333, '\u2013': 556, '\u2014': 1000, '\u2026': 1000,
  '\u00F1': 556, '\u00D1': 722, '\u00E9': 556, '\u00C9': 667,
};
for (const d of '0123456789') WIDTHS[d] = 556;

/** Default tab stops are every half inch; at the 11 pt default that is about 3.27 em. */
const TAB_STOP = 3273;

export const charWidth = (ch: string) => WIDTHS[ch] ?? 556;

/** Cumulative x position before each character, plus the end: result.length === text.length + 1. */
export function positions(text: string): number[] {
  const xs = [0];
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    x = ch === '\t' ? (Math.floor(x / TAB_STOP) + 1) * TAB_STOP : x + charWidth(ch);
    xs.push(x);
  }
  return xs;
}
