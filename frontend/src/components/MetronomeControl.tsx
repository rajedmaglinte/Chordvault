import { Button, Group, Popover, SegmentedControl, Slider, Stack, Switch, Text, UnstyledButton } from '@mantine/core';
import { IconHandFinger, IconMetronome, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { MAX_BPM, MIN_BPM, type Metronome } from '../hooks/useMetronome';

/** A small beat light: bright on every beat, red on the first beat of the bar. */
function BeatLight({ m, size = 10 }: { m: Metronome; size?: number }) {
  const on = m.running && m.beat >= 0;
  const accent = on && m.beat === 0 && m.beatsPerBar > 1;
  return (
    // A new key on every beat restarts the flash animation.
    <span aria-hidden className={`metro-light${on ? ' on' : ''}${accent ? ' accent' : ''}`} key={on ? m.beat : 'off'}
      style={{ width: size, height: size }} />
  );
}

/** The metronome button (shows the tempo) and its controls. */
export function MetronomeControl({ m, size = 'input-md' }: { m: Metronome; size?: 'input-md' | 'input-sm' }) {
  if (!m.supported) return null;
  return (
    <Popover position="bottom-end" shadow="md" width={300} withinPortal trapFocus returnFocus>
      <Popover.Target>
        <UnstyledButton className={`metro-button${m.running ? ' running' : ''}`} aria-label={`Metronome, ${m.bpm} beats per minute${m.running ? ', playing' : ''}`}
          style={{ height: size === 'input-md' ? 42 : 36 }} data-no-swipe>
          <IconMetronome size={20} aria-hidden />
          <span className="metro-bpm">{m.bpm}</span>
          <BeatLight m={m} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown data-no-swipe>
        <Stack gap={12}>
          <Group justify="space-between" align="center">
            <Text fw={700} fz={34} lh={1} aria-live="polite">{m.bpm}<Text span fz={14} c="dimmed" fw={500}> bpm</Text></Text>
            <Button size="md" leftSection={m.running ? <IconPlayerStop size={18} aria-hidden /> : <IconPlayerPlay size={18} aria-hidden />}
              color={m.running ? 'red' : undefined} onClick={m.toggle}>{m.running ? 'Stop' : 'Start'}</Button>
          </Group>

          <Group gap={6} grow>
            {[-5, -1, 1, 5].map(d => (
              <Button key={d} variant="default" size="sm" onClick={() => m.nudge(d)} aria-label={`${d > 0 ? 'Faster' : 'Slower'} by ${Math.abs(d)}`}>
                {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
              </Button>
            ))}
          </Group>
          <Slider min={MIN_BPM} max={MAX_BPM} value={m.bpm} onChange={m.setBpm} label={null} aria-label="Tempo" />

          <Group gap={8} grow>
            <Button variant="default" leftSection={<IconHandFinger size={18} aria-hidden />} onClick={m.tap}>Tap tempo</Button>
            {m.songBpm != null && m.songBpm !== m.bpm && (
              <Button variant="subtle" onClick={m.resetToSong}>Song: {m.songBpm}</Button>
            )}
          </Group>

          <div>
            <Text fz={13} c="dimmed" mb={4}>Beats per bar</Text>
            <SegmentedControl fullWidth value={String(m.beatsPerBar)} onChange={v => m.setBeatsPerBar(Number(v))}
              data={['2', '3', '4', '6']} aria-label="Beats per bar" />
          </div>

          <Group justify="space-between" align="center">
            <Switch label="Sound" checked={m.sound} onChange={e => m.setSound(e.currentTarget.checked)} />
            <Group gap={6} align="center">
              <Text fz={13} c="dimmed">{m.sound ? 'Click and light' : 'Light only (silent)'}</Text>
              <BeatLight m={m} size={14} />
            </Group>
          </Group>
          {m.sound && <Slider min={0} max={1} step={0.05} value={m.volume} onChange={m.setVolume} label={null} aria-label="Volume" />}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

