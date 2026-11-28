import { ActionIcon, Affix, Group, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { ToolbarProps } from './Toolbar';

export interface PlaybackNav {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

interface PlaybackDockProps {
  layout: 'tablet' | 'phone';
  nav: PlaybackNav;
  toolbar: ToolbarProps;
  /** Rows above the controls, such as the live-sync strip. */
  top?: ReactNode;
  /** The section buttons; the song arrows sit at either end of them. */
  sections?: ReactNode;
}

function NavButton({ label, icon, disabled, onClick }: { label: string; icon: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const Icon = icon === 'prev' ? IconChevronLeft : IconChevronRight;
  return <ActionIcon variant="subtle" size={44} className="dock-nav" aria-label={label} disabled={disabled} onClick={onClick}><Icon size={26} aria-hidden /></ActionIcon>;
}

/**
 * One slim row on phones and tablets: previous song, the section buttons, next song. Key, text
 * size and fit live in Settings (the sliders button) so the lyrics get the screen.
 */
export function PlaybackDock({ nav, toolbar, top, sections }: PlaybackDockProps) {
  return (
    <Affix withinPortal={false} position={{ bottom: 0, left: 0, right: 0 }} zIndex={60} className="playback-dock" data-no-swipe>
      {top}
      <Group component="nav" aria-label="Playback controls" wrap="nowrap" gap={2} bg="var(--cv-band)" px={4} className="playback-dock-bar">
        <NavButton label="Previous Song" icon="prev" disabled={!nav.hasPrev} onClick={nav.onPrev} />
        <div className="dock-middle">
          {sections ?? (
            <Text ta="center" fz={15} c="dimmed" truncate>
              Key <Text span inherit fw={700} c="var(--cv-chord)">{toolbar.currentKey || '?'}</Text>
            </Text>
          )}
        </div>
        <NavButton label="Next Song" icon="next" disabled={!nav.hasNext} onClick={nav.onNext} />
      </Group>
    </Affix>
  );
}
