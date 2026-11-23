import { describe, it, expect } from 'vitest';
import { shortSectionLabel, sectionKind } from '../sections';

describe('shortSectionLabel', () => {
  it.each([
    ['Verse 1', 'V1'], ['Verse', 'V'], ['[Verse 2]', 'V2'], ['Chorus', 'C'], ['Chorus 2:', 'C2'],
    ['Pre-Chorus', 'PC'], ['Pre Chorus', 'PC'], ['Bridge', 'B'], ['Intro', 'Intro'], ['Outro', 'Outro'],
    ['Interlude', 'Inter'], ['Instrumental', 'Inst'], ['Ending', 'End'], ['Tag', 'Tag'], ['Refrain', 'R'],
  ])('%s → %s', (label, short) => {
    expect(shortSectionLabel(label)).toBe(short);
  });

  it('keeps unknown labels short', () => {
    expect(shortSectionLabel('Spontaneous worship')).toBe('Spontan…');
    expect(shortSectionLabel('Vamp')).toBe('Vamp');
  });
});

describe('sectionKind', () => {
  it('groups labels for colouring', () => {
    expect(sectionKind('Chorus 2')).toBe('chorus');
    expect(sectionKind('Pre-Chorus')).toBe('other');
    expect(sectionKind('Verse 1')).toBe('verse');
    expect(sectionKind('Bridge')).toBe('bridge');
  });
});

describe('section labels survive transposing', () => {
  it.each([2, 5, -3])('ChordPro with [Intro] / [Chorus] label lines, %i semitones', async (st) => {
    const { renderChordPro } = await import('../chords');
    const content = '{title: X}\n\n[Intro]\n[C] [G] [F] [C]\n\n[Verse 1]\n[C]Open the eyes\n\n[Chorus]\nTo see You [G]high\n\n[Pre-Chorus]\n[F]Holy\n';
    const doc = new DOMParser().parseFromString(renderChordPro(content, st, false), 'text/html');
    expect(Array.from(doc.querySelectorAll('h3.label')).map(h => h.textContent)).toEqual(['Intro', 'Verse 1', 'Chorus', 'Pre-Chorus']);
    // The chords themselves still move.
    expect(doc.querySelector('.chord:not(:empty)')?.textContent).not.toBe('C');
  });
});
