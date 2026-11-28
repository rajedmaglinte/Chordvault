import { ActionIcon, Divider, Drawer, Popover, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/**
 * Opens the settings next to the button that asked for them. With `songPanel` (phones and
 * tablets) it is a sheet from the bottom holding this song's controls (key, text size...) above
 * the setlist-wide defaults, so those controls stay off the playing screen.
 */
export function SetlistDefaultsButton({ panel, songPanel }: { panel: ReactNode; songPanel?: ReactNode }) {
  const [opened, { open, close }] = useDisclosure(false);
  if (songPanel) {
    return (
      <>
        <ActionIcon size="input-md" aria-label="Settings: key, text size and more" title="Settings" onClick={open}>
          <IconAdjustmentsHorizontal size={22} aria-hidden />
        </ActionIcon>
        <Drawer opened={opened} onClose={close} position="bottom" size="auto" title="Settings" radius="lg"
          scrollAreaComponent={ScrollArea.Autosize} classNames={{ content: 'settings-sheet' }} data-no-swipe>
          {songPanel}
          <Divider my="lg" />
          {panel}
        </Drawer>
      </>
    );
  }
  return (
    <Popover position="bottom-end" width={320} shadow="md" radius="lg" trapFocus returnFocus>
      <Popover.Target>
        <ActionIcon size="input-md" aria-label="Setlist defaults" title="Setlist defaults">
          <IconAdjustmentsHorizontal size={22} aria-hidden />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown className="setlist-defaults-panel" p="lg" bg="var(--cv-raise)">{panel}</Popover.Dropdown>
    </Popover>
  );
}
