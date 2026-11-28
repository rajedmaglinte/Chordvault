import { useState } from 'react';
import { Button, Group, NumberInput, Popover, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconMetronome } from '@tabler/icons-react';
import type { SetlistEntry } from '../types';

export type MetronomePatch = { metronome_bpm?: number | null; metronome_beats?: number | null };

/** Tempo and beats per bar for one song in a setlist, set while preparing the setlist. */
export function EntryMetronomeButton({ entry, onSave }: { entry: SetlistEntry; onSave: (patch: MetronomePatch) => Promise<void> | void }) {
  const [opened, setOpened] = useState(false);
  const songBpm = entry.bpm ?? null;
  const [bpm, setBpm] = useState<number | ''>(entry.metronome_bpm ?? songBpm ?? '');
  const [beats, setBeats] = useState(String(entry.metronome_beats ?? 4));
  const shownBpm = entry.metronome_bpm ?? songBpm;
  const custom = entry.metronome_bpm != null || entry.metronome_beats != null;

  const open = () => {
    setBpm(entry.metronome_bpm ?? songBpm ?? '');
    setBeats(String(entry.metronome_beats ?? 4));
    setOpened(true);
  };
  const save = async () => {
    const value = bpm === '' ? null : Math.round(Number(bpm));
    await onSave({
      // Same as the song's own tempo: store nothing, so later song edits still apply.
      metronome_bpm: value === songBpm ? null : value,
      metronome_beats: beats === '4' ? null : Number(beats),
    });
    setOpened(false);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" shadow="md" width={260} trapFocus withinPortal>
      <Popover.Target>
        <Button variant={custom ? 'light' : 'default'} size="xs" leftSection={<IconMetronome size={14} aria-hidden />} onClick={open}
          aria-label={`Metronome for ${entry.title}: ${shownBpm ? `${shownBpm} bpm` : 'no tempo'}${entry.metronome_beats ? `, ${entry.metronome_beats} beats per bar` : ''}`}>
          {shownBpm ?? '–'}{entry.metronome_beats ? ` · ${entry.metronome_beats}/4` : ''}
        </Button>
      </Popover.Target>
      <Popover.Dropdown onClick={e => e.stopPropagation()}>
        <Stack gap={10}>
          <Text fw={600} fz={14}>Metronome for this song</Text>
          <NumberInput label="Tempo (bpm)" min={30} max={250} clampBehavior="strict" allowDecimal={false} value={bpm}
            onChange={v => setBpm(v === '' ? '' : Number(v))} placeholder={songBpm ? String(songBpm) : 'e.g. 72'}
            description={songBpm ? `Song's own tempo: ${songBpm}` : 'This song has no tempo yet'} />
          <div>
            <Text fz={13} mb={4}>Beats per bar</Text>
            <SegmentedControl fullWidth value={beats} onChange={setBeats} data={['2', '3', '4', '6']} aria-label="Beats per bar" />
          </div>
          <Group justify="space-between">
            <Button variant="subtle" size="xs" onClick={async () => { await onSave({ metronome_bpm: null, metronome_beats: null }); setOpened(false); }}
              disabled={!custom}>Use song&rsquo;s tempo</Button>
            <Button size="xs" onClick={save}>Save</Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
