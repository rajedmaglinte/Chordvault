import { Button, Group, Stack, Switch, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import type { ToolbarProps } from './Toolbar';
import { KeyPicker } from './KeyPicker';
import { ColumnsToggle, FitButton, TextSizeGroup } from './ToolbarControls';

const switchStyles = { body: { justifyContent: 'space-between' } };

/**
 * Controls for the song on screen (key, text size, fit, columns, numbers), kept in the settings
 * sheet on phones and tablets so the playing screen stays clear.
 */
export function SongControlsPanel({ toolbar, columns = true }: { toolbar: ToolbarProps; columns?: boolean }) {
  const overrides = toolbar.overrides ?? {};
  return (
    <Stack gap="md">
      <Text size="sm" fw={600} c="dimmed">This song</Text>
      <div>
        <Group justify="space-between" mb={6}>
          <Text size="sm">Key</Text>
          <Text size="sm" fw={700} c="var(--cv-chord)">{toolbar.currentKey || '?'}</Text>
        </Group>
        <KeyPicker currentKey={toolbar.currentKey} onPickKey={toolbar.onPickKey} isModified={toolbar.isModified}
          onSaveOnline={toolbar.onSaveOnline} onSaveLocal={toolbar.onSaveLocal} />
      </div>
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
      {toolbar.onNashvilleChange && (
        <Switch labelPosition="left" label="Number notation" checked={toolbar.nashville} disabled={toolbar.nashvilleDisabled}
          onChange={(e) => toolbar.onNashvilleChange?.(e.target.checked)} styles={switchStyles} />
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

