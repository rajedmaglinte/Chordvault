/** Short button text for a section label: "Verse 2" → "V2", "Pre-Chorus" → "PC", "Bridge" → "B". */
const SHORT: [RegExp, string][] = [
  [/^pre[- ]?chorus/i, 'PC'],
  [/^verse/i, 'V'],
  [/^chorus/i, 'C'],
  [/^refrain/i, 'R'],
  [/^bridge/i, 'B'],
  [/^intro/i, 'Intro'],
  [/^outro/i, 'Outro'],
  [/^interlude/i, 'Inter'],
  [/^instrumental/i, 'Inst'],
  [/^ending/i, 'End'],
  [/^tag/i, 'Tag'],
  [/^coda/i, 'Coda'],
  [/^break/i, 'Break'],
  [/^solo/i, 'Solo'],
];

export function shortSectionLabel(label: string): string {
  const text = label.replace(/[[\]:]/g, '').trim();
  const num = text.match(/(\d+)\s*$/)?.[1] ?? '';
  for (const [re, short] of SHORT) {
    if (re.test(text)) return short + num;
  }
  // Unknown label (e.g. a custom {start_of_verse: Ending A}): keep it short but readable.
  return text.length > 8 ? `${text.slice(0, 7)}…` : text;
}

/** Colour family for a section button, matching how the sheet styles sections. */
export function sectionKind(label: string): 'verse' | 'chorus' | 'bridge' | 'other' {
  const text = label.trim().toLowerCase();
  if (/^pre[- ]?chorus/.test(text)) return 'other';
  if (/^(chorus|refrain)/.test(text)) return 'chorus';
  if (/^verse/.test(text)) return 'verse';
  if (/^bridge/.test(text)) return 'bridge';
  return 'other';
}
