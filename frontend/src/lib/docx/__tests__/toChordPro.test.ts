import { describe, it, expect } from 'vitest';
import { linesToChordPro, parseHeader, isChordLine, mergeChords, guessLanguage } from '../toChordPro';
import { renderChordPro } from '../../chords';

describe('section headers', () => {
  it.each([
    ['[Intro]', 'Intro', ''],
    ['[Verse] ', 'Verse', ''],
    ['[Verse 1] 2x', 'Verse 1', '2x'],
    ['[Chorus 1]', 'Chorus 1', ''],
    ['[Bridge/Outro]', 'Bridge/Outro', ''],
    ['[End 2x]', 'End', '2x'],
    ['INTRO:', 'Intro', ''],
    ['VERSE1:', 'Verse 1', ''],
    ['PRE-CHORUS:', 'Pre-Chorus', ''],
    ['BRIDGE: ', 'Bridge', ''],
    ['Chorus (3x)', 'Chorus', '3x'],
  ])('%s', (line, label, note) => {
    expect(parseHeader(line)).toEqual({ label, note });
  });

  it('does not mistake lyrics for headers', () => {
    expect(parseHeader('Chorus of angels singing loud and clear')).toBeNull();
    expect(parseHeader('Open the eyes of my heart, Lord')).toBeNull();
  });
});

describe('chord lines', () => {
  it.each(['C G F C', '              D-F#/D- G-A', 'D-F#/D- G-A (3x)', 'C—C A', 'F#m-Bm', 'Em   D', 'G/B', 'Cmaj7 Dsus4 Bb'])('%s is a chord line', (line) => {
    expect(isChordLine(line)).toBe(true);
  });
  it.each(['Open the eyes of my heart', 'A mighty fortress', 'INTRO:', ''])('%s is not', (line) => {
    expect(isChordLine(line)).toBe(false);
  });
});

describe('placing chords', () => {
  it('uses Arial widths, so chords typed over UPPERCASE lyrics land where they were seen', () => {
    // 13 spaces in Arial reach only about five capital letters (counting characters would say MAMASDAN).
    expect(mergeChords('D             F#m', 'KUNG AKING MAMASDAN')).toBe('[D]KUNG [F#m]AKING MAMASDAN');
  });
  it('keeps a chord that sits well inside a long word on its letter', () => {
    expect(mergeChords('D               F#m', 'KUNG AKING MAMASDAN')).toBe('[D]KUNG AKI[F#m]NG MAMASDAN');
  });
  it('puts a chord that lands just inside a word on the word', () => {
    expect(mergeChords('   F                                       G', "Shinin' in the light of Your glory")).toBe("[F]Shinin' in the light of Your [G]glory");
  });
  it('keeps dash-joined chords together', () => {
    expect(mergeChords('              D-F#/D- G-A', "Sino'ng hihigit sa 'yong")).toMatch(/\[D\]\[F#\/D\]/);
  });
  it('keeps chords that sit past the end of the lyric', () => {
    expect(mergeChords('Em                      A', 'Short')).toMatch(/^\[Em\]Short\s+\[A\]$/);
  });
});

describe('whole songs', () => {
  const song = [
    'OPEN THE EYES', '',
    '[Intro]', 'C G F C', '', '',
    '[Verse 1] 2x', 'C', 'Open the eyes of my heart, Lord', '                F', 'I want to see You', ' ', '',
    '[Chorus]', '                   G                   Am', 'To see You high and lifted up', '',
    '[Verse]', '', '',
    '[Chorus]', ' ',
  ];

  it('turns a typical document into ChordPro with labelled sections', () => {
    const out = linesToChordPro(song, 'OPEN_THE_EYES');
    expect(out.title).toBe('Open The Eyes');
    expect(out.key).toBe('C');
    expect(out.language).toBe('en');
    expect(out.sections).toBe(3);
    expect(out.warnings).toEqual([]);
    expect(out.content).toContain('{start_of_verse: Intro}\n[C] [G] [F] [C]\n{end_of_verse}');
    expect(out.content).toContain('{start_of_verse: Verse 1}\n{comment: 2x}\n[C]Open the eyes of my heart, Lord\nI want to [F]see You\n{end_of_verse}');
    expect(out.content).toContain('{start_of_chorus: Chorus}');
    // Headers with nothing under them mean "repeat that part".
    expect(out.content).toContain('{comment: Verse}');
  });

  it('renders in ChordVault with a heading per section (which feeds the section buttons)', () => {
    const html = renderChordPro(linesToChordPro(song, 'x').content, 0, false);
    const labels = Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('h3.label')).map(h => h.textContent);
    expect(labels).toEqual(['Intro', 'Verse 1', 'Chorus', 'Verse', 'Chorus']);
  });

  it('two empty lines end a section, so an instrumental line is not swallowed by the chorus', () => {
    const out = linesToChordPro(['SONG', 'CHORUS:', 'G', 'SALAMAT', '', '', 'D F#m Em A'], 'x').content;
    expect(out).toMatch(/\{end_of_chorus\}\n\n\[D\] \[F#m\] \[Em\] \[A\]/);
  });

  it('drops indents typed to line lyrics up under chords', () => {
    const out = linesToChordPro(['SONG', 'CHORUS:', 'F#m-Bm             G', '    Magdiwang, atin Siyang awitan', '   plain indented line'], 'x').content;
    expect(out).toMatch(/^\[F#m\]\[Bm\]Magdiwang, /m);
    expect(out).toContain('\nplain indented line\n');
  });

  it('removes invisible characters and guesses Tagalog', () => {
    const out = linesToChordPro(['AWIT', 'VERSE:', 'G', "BUHAY KO NG SAYO‎'Y SUMAMBA ANG PAG-IBIG MO"], 'x');
    expect(out.content).toContain("SAYO'Y");
    expect(out.language).toBe('tl');
  });

  it('warns when a document has no chords or sections', () => {
    expect(linesToChordPro(['Just a title', 'some words'], 'x').warnings).toEqual(['No chords found', 'No section labels (Verse, Chorus...) found']);
  });

  it('guesses the language from common words', () => {
    expect(guessLanguage('I want to see You, Lord')).toBe('en');
    expect(guessLanguage("Sino'ng hihigit sa 'yong kapangyarihan, ang pag-ibig mo")).toBe('tl');
  });
});
