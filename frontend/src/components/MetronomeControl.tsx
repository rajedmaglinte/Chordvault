import { UnstyledButton } from '@mantine/core';
import { IconMetronome } from '@tabler/icons-react';
import type { Metronome } from '../hooks/useMetronome';

/** A small beat light: bright on every beat, red on the first beat of the bar. */
function BeatLight({ m, size = 10 }: { m: Metronome; size?: number }) {
  const on = m.running && m.beat >= 0;
  const accent = on && m.beat === 0;
  return (
    // A new key on every beat restarts the flash animation.
    <span aria-hidden className={`metro-light${on ? ' on' : ''}${accent ? ' accent' : ''}`} key={on ? m.beat : 'off'}
      style={{ width: size, height: size }} />
  );
}

/**
 * Tap to start, tap to stop. Tempo and beats per bar are set ahead of time (per song in the
 * setlist editor), and sound/volume in the settings menu, so nothing opens over the lyrics.
 */
export function MetronomeControl({ m, size = 'input-md' }: { m: Metronome; size?: 'input-md' | 'input-sm' }) {
  if (!m.supported) return null;
  const label = m.running ? `Stop metronome (${m.bpm} bpm)` : `Start metronome at ${m.bpm} bpm${m.hasTempo ? '' : ' (song has no tempo)'}`;
  return (
    <UnstyledButton className={`metro-button${m.running ? ' running' : ''}`} aria-label={label} title={label} aria-pressed={m.running}
      onClick={m.toggle} style={{ height: size === 'input-md' ? 42 : 36 }} data-no-swipe>
      <IconMetronome size={20} aria-hidden />
      <span className="metro-bpm">{m.bpm}</span>
      <BeatLight m={m} />
    </UnstyledButton>
  );
}
