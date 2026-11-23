import { Button, Group, Text } from '@mantine/core';
import { IconBroadcast, IconPlayerPause, IconRefresh } from '@tabler/icons-react';
import type { LiveState, LiveStatus } from '../hooks/useLiveSession';

interface LiveBarProps {
  remote: LiveState | null;
  status: LiveStatus;
  leading: boolean;
  following: boolean;
  canLead: boolean;
  error: string | null;
  /** Why live sync is not offered here (shown instead of nothing, so people know what to change). */
  notice?: string | null;
  onStartLeading: () => void;
  onStopLeading: () => void;
  onPause: () => void;
  onResync: () => void;
}

/** One line of live-session status and controls for the setlist player. */
export function LiveBar({ remote, status, leading, following, canLead, error, notice, onStartLeading, onStopLeading, onPause, onResync }: LiveBarProps) {
  const live = !!remote?.active;
  const followers = Math.max(0, (remote?.listeners ?? 1) - 1);
  const reconnecting = status === 'connecting' && (leading || live);

  if (leading) {
    return (
      <Group className="live-bar is-leading" wrap="nowrap" gap="xs" data-no-swipe role="status">
        <span className="live-dot" aria-hidden />
        <Text fw={700} size="sm" flex={1} truncate>
          {reconnecting ? 'Reconnecting…' : error ? error : `LIVE · You are leading · ${followers} following`}
        </Text>
        <Button size="xs" variant="default" onClick={onStopLeading}>End live</Button>
      </Group>
    );
  }

  if (live) {
    return (
      <Group className={`live-bar ${following ? 'is-following' : 'is-paused'}`} wrap="nowrap" gap="xs" data-no-swipe role="status">
        <span className="live-dot" aria-hidden />
        <Text fw={700} size="sm" flex={1} truncate>
          {reconnecting ? 'Reconnecting…' : following ? `Following ${remote?.leader ?? 'leader'}` : `Paused · ${remote?.leader ?? 'leader'} is live`}
        </Text>
        {following
          ? <Button size="xs" variant="default" leftSection={<IconPlayerPause size={14} aria-hidden />} onClick={onPause}>Pause</Button>
          : <Button size="xs" leftSection={<IconRefresh size={14} aria-hidden />} onClick={onResync}>Re-sync</Button>}
        {canLead && <Button size="xs" variant="subtle" onClick={onStartLeading}>Take over</Button>}
      </Group>
    );
  }

  if (canLead && status === 'connected') {
    return (
      <Group className="live-bar is-idle" wrap="nowrap" gap="xs" data-no-swipe>
        <Text size="sm" flex={1} truncate>Lead the team: everyone playing this setlist follows your song and section taps.</Text>
        <Button size="sm" className="live-lead-btn" leftSection={<IconBroadcast size={18} aria-hidden />} onClick={onStartLeading}>Lead live</Button>
      </Group>
    );
  }
  if (notice) {
    return (
      <Group className="live-bar is-notice" wrap="nowrap" gap="xs" data-no-swipe role="status">
        <IconBroadcast size={16} aria-hidden style={{ flexShrink: 0, opacity: 0.7 }} />
        <Text size="sm" c="dimmed" flex={1} lineClamp={2}>{notice}</Text>
      </Group>
    );
  }
  return null;
}
