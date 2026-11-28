import { ActionIcon, Button, Group, Slider, Stack, Switch, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';

const switchStyles = { body: { justifyContent: 'space-between' } };

interface SettingsPanelProps {
  nashville: boolean;
  onNashvilleChange: (val: boolean) => void;
  hideYt: boolean;
  onHideYtChange: (val: boolean) => void;
  twoCol: boolean;
  onTwoColChange: (val: boolean) => void;
  fontSize: number;
  onFontChange: (delta: number) => void;
  onFontReset: () => void;
  keepScreenOn?: boolean;
  onKeepScreenOnChange?: (val: boolean) => void;
  /** Metronome sound (off = silent light only) and volume; set here, not over the lyrics. */
  metronomeSound?: boolean;
  onMetronomeSoundChange?: (val: boolean) => void;
  metronomeVolume?: number;
  onMetronomeVolumeChange?: (val: number) => void;
}

export function SettingsPanel({
  nashville,
  onNashvilleChange,
  hideYt,
  onHideYtChange,
  twoCol,
  onTwoColChange,
  fontSize,
  onFontChange,
  onFontReset,
  keepScreenOn,
  onKeepScreenOnChange,
  metronomeSound,
  onMetronomeSoundChange,
  metronomeVolume,
  onMetronomeVolumeChange,
}: SettingsPanelProps) {
  return (
    <>
      <Text size="sm" fw={600} c="dimmed" mb="md">Setlist defaults for all songs</Text>
      <Stack gap="md">
        {keepScreenOn !== undefined && onKeepScreenOnChange && (
          <Switch labelPosition="left" label="Keep screen on" checked={keepScreenOn} onChange={(e) => onKeepScreenOnChange(e.target.checked)} styles={switchStyles} />
        )}
        {metronomeSound !== undefined && onMetronomeSoundChange && (
          <Switch labelPosition="left" label={metronomeSound ? 'Metronome sound' : 'Metronome sound (off: light only)'} checked={metronomeSound}
            onChange={(e) => onMetronomeSoundChange(e.target.checked)} styles={switchStyles} />
        )}
        {metronomeSound && metronomeVolume !== undefined && onMetronomeVolumeChange && (
          <Group justify="space-between" wrap="nowrap" gap="md">
            <Text size="sm">Metronome volume</Text>
            <Slider flex={1} maw={160} min={0} max={1} step={0.05} value={metronomeVolume} onChange={onMetronomeVolumeChange} label={null} aria-label="Metronome volume" />
          </Group>
        )}
        <Switch labelPosition="left" label="Number notation" checked={nashville} onChange={(e) => onNashvilleChange(e.target.checked)} styles={switchStyles} />
        <Switch labelPosition="left" label="Hide YouTube" checked={hideYt} onChange={(e) => onHideYtChange(e.target.checked)} styles={switchStyles} />
        <Switch labelPosition="left" label="Multi-column layout" checked={twoCol} onChange={(e) => onTwoColChange(e.target.checked)} styles={switchStyles} />
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">Font size</Text>
          <Group gap={6} wrap="nowrap">
            <Button.Group>
              <Button size="md" px="sm" aria-label="Decrease default font size" onClick={() => onFontChange(-1)}>A&#8722;</Button>
              <Button size="md" px="sm" aria-label="Increase default font size" onClick={() => onFontChange(1)}>A+</Button>
            </Button.Group>
            <ActionIcon size="input-md" aria-label="Reset default font size" title="Reset" disabled={fontSize === 0} onClick={onFontReset}>
              <IconRestore size={18} aria-hidden />
            </ActionIcon>
          </Group>
        </Group>
      </Stack>
    </>
  );
}
