import { Button, Group, Stack, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import type { ToolbarProps } from './Toolbar';
import { ColumnsToggle, FitButton, TextSizeGroup } from './ToolbarControls';

/**
 * Display controls for the song on screen (text size, fit, columns), kept in the settings
 * sheet on phones and tablets so the playing screen stays clear.
 */
export function SongControlsPanel({ toolbar, columns = true }: { toolbar: ToolbarProps; columns?: boolean }) {
  const overrides = toolbar.overrides ?? {};
  return (
    <Stack gap="md">
      <Text size="sm" fw={600} c="dimmed">This song</Text>
      <Text size="xs" c="dimmed">
        Key {toolbar.currentKey || '?'}. Keys and metronome tempos are set per song in the setlist (during practice), so they stay put during the service.
      </Text>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">Text size</Text>
        <Group gap={6} wrap="nowrap">
          <TextSizeGroup onFontChange={toolbar.onFontChange} overridden={overrides.font} />
          {toolbar.onAutoFit && <FitButton onAutoFit={toolbar.onAutoFit} />}
        </Group>
      </Group>
      {columns && (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">Columns</Text>
          <ColumnsToggle twoCol={toolbar.twoCol} onTwoColToggle={toolbar.onTwoColToggle} overridden={overrides.twoCol} />
        </Group>
      )}
      {toolbar.onReset && (
        <Group justify="flex-end">
          <Button variant="subtle" size="xs" leftSection={<IconRestore size={14} aria-hidden />} disabled={!toolbar.canReset} onClick={toolbar.onReset}>
            Reset this song&rsquo;s layout
          </Button>
        </Group>
      )}
    </Stack>
  );
}

