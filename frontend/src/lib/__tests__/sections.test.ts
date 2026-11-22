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
