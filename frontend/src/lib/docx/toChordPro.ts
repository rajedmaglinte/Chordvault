import { positions } from './arial';

/*
 * Turns the lines of a chord-sheet document (as typed in Google Docs / Word) into ChordPro:
 *
 *   OPEN THE EYES            ->  {title: Open The Eyes}
 *   [Verse 1] 2x             ->  {start_of_verse: Verse 1} {comment: 2x} ... {end_of_verse}
 *   CHORUS:                  ->  {start_of_chorus: Chorus} ... {end_of_chorus}
 *   "      G        Am"      ->  chords placed into the lyric line below at the same
 *   "To see You high and..."     horizontal spot they had in Arial: "To see [G]You high..."
 *   D-F#/D- G-A (3x)         ->  [D] [F#/D] [G] [A] (3x)
 *   [Verse]  (nothing under) ->  {comment: Verse}  (a "repeat this section" marker)
 */

export interface ConvertedSong {
  title: string;
  content: string;
  language: string;
  key: string;
  sections: number;
  chordLines: number;
  warnings: string[];
}

const INVISIBLE = /[\u200B-\u200F\u2060\uFEFF]/g;

const CHORD = /^[A-G](?:#|b)?(?:maj|min|m|M|dim|aug|sus|add|\+|\u00B0|\u00F8)?\d{0,2}(?:(?:sus|add|maj|b|#)\d{1,2})*(?:\/[A-G](?:#|b)?)?$/;
const REPEAT = /^\(?(?:x\s*\d+|\d+\s*x)\)?$/i;
const SEPARATORS = /[-\u2013\u2014]+/;

const SECTION_WORDS = 'intro|verse|pre[- ]?chorus|chorus|refrain|bridge|outro|interlude|instrumental|ending|end|tag|coda|break|solo|hook|vamp|turnaround';
const BRACKETED = new RegExp(`^\\[\\s*((?:${SECTION_WORDS})\\b[^\\]]*)\\](.*)$`, 'i');
const COLONED = new RegExp(`^((?:${SECTION_WORDS})\\s*\\d*[^:]{0,20}):(.*)$`, 'i');
const BARE = new RegExp(`^((?:${SECTION_WORDS})\\s*\\d*)\\s*(\\(?(?:x\\s*\\d+|\\d+\\s*x)\\)?)?$`, 'i');
const REPEAT_IN_TEXT = /\(?(?:x\s*\d+|\d+\s*x)\)?/i;

export function cleanLine(raw: string): string {
  return raw.replace(INVISIBLE, '').replace(/\u00A0/g, ' ').replace(/\s+$/, '');
}

const isChord = (token: string) => CHORD.test(token);

/** A line of only chords (dash-joined groups allowed) and repeat marks like (3x). */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let chords = 0;
  for (const token of tokens) {
    if (REPEAT.test(token) || token === '|' || token === '/' || token === '%') continue;
    const parts = token.split(SEPARATORS).filter(Boolean);
    if (!parts.length || !parts.every(isChord)) return false;
    chords += parts.length;
  }
  return chords > 0;
}

/** Chord groups on a chord line with their horizontal position (Arial units).
 *  A dash-joined group like "D-F#/D" is one group: those chords share the spot. */
function chordGroups(line: string): { names: string[]; x: number }[] {
  const xs = positions(line);
  const out: { names: string[]; x: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const names = m[0].split(SEPARATORS).filter(isChord);
    if (names.length) out.push({ names, x: xs[m.index] });
  }
  return out;
}

const chordNames = (line: string) => chordGroups(line).flatMap(g => g.names);

function repeatNote(line: string): string {
  const m = line.trim().split(/\s+/).find(t => REPEAT.test(t));
  return m ? m.replace(/[()]/g, '') : '';
}

const SPACE = 278;

/**
 * Where a chord at horizontal position x belongs in the lyric. Chords typed with spaces in a
 * proportional font rarely line up exactly, so one that lands near the start of a word (or in
 * the gap just before it) goes on that word; one well inside a long word stays on its letter.
 */
function insertionIndex(text: string, xs: number[], x: number, from: number): number {
  const words: { start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) words.push({ start: m.index, end: m.index + m[0].length });
  for (let w = 0; w < words.length; w++) {
    const { start, end } = words[w];
    if (end <= from) continue;
    const ws = xs[start], we = xs[end];
    if (x < ws) {
      // In the gap before this word: take the word when the chord is nearer to it than to the previous one.
      const prevEnd = w > 0 ? xs[words[w - 1].end] : 0;
      if (w === 0 || ws - x <= 2 * SPACE || ws - x < x - prevEnd) return Math.max(from, start);
      return Math.max(from, words[w - 1].end);
    }
    if (x < we) {
      if (x - ws <= Math.max((we - ws) * 0.4, 1.6 * SPACE)) return Math.max(from, start);
      let best = Math.max(from, start);
      for (let i = best; i <= end; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
      return best;
    }
  }
  return text.length;
}

/** Puts each chord group into the lyric line at the matching horizontal spot. */
export function mergeChords(chordLine: string, lyric: string): string {
  const groups = chordGroups(chordLine);
  let text = lyric;
  let xs = positions(text);
  // Chords past the end of the lyric: pad with spaces so they keep their spot.
  const lastX = groups.length ? groups[groups.length - 1].x : 0;
  while (xs[xs.length - 1] + SPACE / 2 < lastX) { text += ' '; xs = positions(text); }

  const inserts: { at: number; chords: string }[] = [];
  let from = 0;
  for (const { names, x } of groups) {
    const at = insertionIndex(text, xs, x, from);
    inserts.push({ at, chords: names.map(n => `[${n}]`).join('') });
    from = at;
  }
  let out = '';
  let pos = 0;
  for (const { at, chords } of inserts) { out += text.slice(pos, at) + chords; pos = at; }
  return (out + text.slice(pos)).replace(/\s+$/, '');
}

/** A chord line with no lyric under it: chords in order, plus any repeat note. */
function chordOnlyRow(line: string): string {
  const row = chordNames(line).map(n => `[${n}]`).join(' ');
  const note = repeatNote(line);
  return note ? `${row} (${note})` : row;
}

interface Header { label: string; note: string }

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/(-])([a-z\u00E0-\u00FF])/g, (_m, p, c) => p + c.toUpperCase());

function normalizeLabel(raw: string): { label: string; note: string } {
  let text = raw.trim();
  let note = '';
  const r = text.match(REPEAT_IN_TEXT);
  if (r) { note = r[0].replace(/[()\s]/g, ''); text = text.replace(r[0], ''); }
  text = text.replace(/\s+/g, ' ').trim()
    .replace(/^(\D*?)(\d+)$/, (_m, word, n) => `${word.trim()} ${n}`);
  return { label: titleCase(text), note };
}

export function parseHeader(line: string): Header | null {
  const t = line.trim();
  let m = t.match(BRACKETED);
  if (m) {
    const inner = normalizeLabel(m[1]);
    const after = m[2].trim();
    const note = inner.note || (REPEAT_IN_TEXT.test(after) ? after.replace(/[()\s]/g, '') : after);
    return { label: inner.label, note };
  }
  m = t.match(COLONED);
  if (m && !isChordLine(m[2] || '') && (m[2] || '').trim().split(/\s+/).length <= 3) {
    const inner = normalizeLabel(m[1]);
    const after = (m[2] || '').trim();
    return { label: inner.label, note: inner.note || after.replace(/[()\s]/g, '') };
  }
  m = t.match(BARE);
  if (m) {
    const inner = normalizeLabel(m[1]);
    return { label: inner.label, note: (m[2] || '').replace(/[()\s]/g, '') };
  }
  return null;
}

function directiveFor(label: string): string {
  const l = label.toLowerCase();
  if (/^pre[- ]?chorus/.test(l)) return 'verse';
  if (/^(chorus|refrain)/.test(l)) return 'chorus';
  if (/^bridge/.test(l)) return 'bridge';
  return 'verse';
}

const TAGALOG = /\b(ang|ng|mga|sa|ko|mo|ay|ikaw|aking|ako|hesus|panginoon|kay|ating|atin|siya|niya|natin|ka|na|kong|iyong|'yong|pag-ibig|salamat|puso)\b/gi;
const ENGLISH = /\b(the|and|you|your|my|of|to|is|in|lord|we|i|me|our|for|will|be|are)\b/gi;

export function guessLanguage(lyrics: string): string {
  const tl = (lyrics.match(TAGALOG) || []).length;
  const en = (lyrics.match(ENGLISH) || []).length;
  return tl > en ? 'tl' : 'en';
}

/** Converts document lines to ChordPro. `fallbackTitle` (e.g. the file name) is used when no title line is found. */
export function linesToChordPro(rawLines: string[], fallbackTitle: string): ConvertedSong {
  const lines = rawLines.map(cleanLine);
  const warnings: string[] = [];

  // Title: the first non-empty line, unless it is already a section, chord or long lyric line.
  let start = lines.findIndex(l => l.trim() !== '');
  let title = fallbackTitle;
  if (start >= 0 && !parseHeader(lines[start]) && !isChordLine(lines[start]) && lines[start].trim().length <= 80) {
    title = lines[start].trim();
    start += 1;
  } else if (start < 0) {
    start = lines.length;
  }
  if (title === title.toUpperCase()) title = titleCase(title);

  type Block = { header: Header | null; body: string[] };
  const blocks: Block[] = [];
  let current: Block = { header: null, body: [] };
  let blankRun = 0;
  for (const line of lines.slice(start)) {
    if (!line.trim()) { blankRun++; current.body.push(line); continue; }
    const header = parseHeader(line);
    if (header) { blocks.push(current); current = { header, body: [] }; blankRun = 0; continue; }
    // Two or more empty lines end a section: what follows (e.g. an instrumental chord line) stands on its own.
    if (blankRun >= 2 && current.header && current.body.some(l => l.trim())) { blocks.push(current); current = { header: null, body: [] }; }
    blankRun = 0;
    current.body.push(line);
  }
  blocks.push(current);

  const out: string[] = [];
  let chordLines = 0;
  let sections = 0;
  const allChords: string[] = [];
  const lyricText: string[] = [];

  const renderBody = (body: string[]) => {
    const rows: string[] = [];
    for (let i = 0; i < body.length; i++) {
      const line = body[i];
      if (!line.trim()) { if (rows.length && rows[rows.length - 1] !== '') rows.push(''); continue; }
      if (isChordLine(line)) {
        chordLines++;
        allChords.push(...chordNames(line));
        const next = body[i + 1];
        if (next !== undefined && next.trim() && !isChordLine(next) && !parseHeader(next)) {
          // Indents typed to line words up under chords are not needed once chords are inline.
          rows.push(mergeChords(line, next).replace(/^\s+/, ''));
          lyricText.push(next);
          i++;
        } else {
          rows.push(chordOnlyRow(line));
        }
        continue;
      }
      rows.push(line.replace(/^\s+/, ''));
      lyricText.push(line);
    }
    while (rows.length && rows[rows.length - 1] === '') rows.pop();
    return rows;
  };

  for (const block of blocks) {
    const rows = renderBody(block.body);
    if (!block.header) {
      if (rows.length) { out.push(...rows.filter(r => r !== ''), ''); }
      continue;
    }
    const { label, note } = block.header;
    if (!rows.length) {
      // A header with nothing under it means "repeat that section here".
      out.push(`{comment: ${label}${note ? ` (${note})` : ''}}`, '');
      continue;
    }
    sections++;
    const type = directiveFor(label);
    out.push(`{start_of_${type}: ${label}}`);
    if (note) out.push(`{comment: ${note}}`);
    // Blank lines would end the section early, so stanzas inside one section are kept together.
    out.push(...rows.filter(r => r !== ''));
    out.push(`{end_of_${type}}`, '');
  }

  const language = guessLanguage(lyricText.join(' '));
  const firstChord = allChords[0] || '';
  const lastChord = allChords[allChords.length - 1] || '';
  const root = (c: string) => c.replace(/\/.*$/, '');
  const key = firstChord ? root(lastChord && root(lastChord) === root(firstChord) ? lastChord : firstChord) : '';

  if (!chordLines) warnings.push('No chords found');
  if (!sections) warnings.push('No section labels (Verse, Chorus...) found');
  if (!lyricText.length) warnings.push('No lyrics found');

  const head = [`{title: ${title}}`];
  if (key) head.push(`{key: ${key}}`);
  head.push(`{x_language: ${language}}`, '');
  while (out.length && out[out.length - 1] === '') out.pop();
  return { title, content: [...head, ...out].join('\n') + '\n', language, key, sections, chordLines, warnings };
}
