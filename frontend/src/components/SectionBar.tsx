import { useEffect, useRef } from 'react';
import { UnstyledButton } from '@mantine/core';
import { shortSectionLabel, sectionKind } from '../lib/sections';
import type { SongSection } from '../hooks/useSongSections';
import { useI18n } from '../context/I18nContext';

interface SectionBarProps {
  sections: SongSection[];
  active: number;
  onJump: (index: number) => void;
}

/** A row of buttons, one per song section, that jump the sheet to that section. */
export function SectionBar({ sections, active, onJump }: SectionBarProps) {
  const { t } = useI18n();
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the lit button visible when the row is wider than the screen.
  useEffect(() => {
    const row = rowRef.current;
    const btn = row?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!row || !btn) return;
    const left = btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  if (sections.length < 2) return null;
  return (
    <div ref={rowRef} className="section-bar" role="toolbar" aria-label={t('setlist.sections')} data-no-swipe>
      {sections.map((s) => (
        <UnstyledButton key={s.index} data-section={s.index} data-kind={sectionKind(s.label)}
          className="section-bar-btn" aria-label={s.label} title={s.label}
          aria-current={s.index === active ? 'true' : undefined}
          onClick={() => onJump(s.index)}>
          {shortSectionLabel(s.label)}
        </UnstyledButton>
      ))}
    </div>
  );
}
