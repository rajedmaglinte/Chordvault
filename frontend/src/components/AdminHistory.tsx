import { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Code, Group, Paper, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { SectionTitle } from './SectionTitle';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../context/I18nContext';
import { parseDbTime } from '../lib/format';
import type { HistoryEntry, HistoryPage } from '../types';

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'song.added': { label: 'Added', color: 'green' },
  'song.imported': { label: 'Imported', color: 'green' },
  'song.modified': { label: 'Modified', color: 'blue' },
  'song.deactivated': { label: 'Deactivated', color: 'orange' },
  'song.reactivated': { label: 'Reactivated', color: 'teal' },
  'song.deleted': { label: 'Deleted', color: 'red' },
  'user.added': { label: 'User added', color: 'green' },
  'user.blocked': { label: 'Blocked', color: 'orange' },
  'user.unblocked': { label: 'Unblocked', color: 'teal' },
  'user.role': { label: 'Role changed', color: 'blue' },
  'user.deleted': { label: 'User deleted', color: 'red' },
};

const FIELD_NAMES: Record<string, string> = {
  title: 'title', artist: 'artist', key: 'key', content: 'chords/lyrics', visibility: 'visibility',
  youtube_url: 'YouTube link', bpm: 'BPM', tags: 'tags', language: 'language',
};

/** A short, plain sentence about what the entry changed. */
function describe(e: HistoryEntry): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(d.fields)) parts.push(`changed ${(d.fields as string[]).map(f => FIELD_NAMES[f] ?? f).join(', ')}`);
  if (d.previousTitle) parts.push(`was "${String(d.previousTitle)}"`);
  if (d.correctionBy) parts.push(`correction by @${String(d.correctionBy)}`);
  if (d.versionOf) parts.push(`new version of "${String(d.versionOf)}"`);
  if (d.owner && e.action !== 'song.modified') parts.push(`owner @${String(d.owner)}`);
  if (d.from && d.to) parts.push(`${String(d.from)} → ${String(d.to)}`);
  if (typeof d.songs === 'number') parts.push(`${d.songs} songs removed with them`);
  if (d.via) parts.push(`joined by ${String(d.via)}`);
  return parts.join(' · ');
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const apiCall = useApi();
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'gray' };
  const detail = describe(entry);

  const toggle = async () => {
    if (!open && snapshot === null) {
      const full = await apiCall<HistoryEntry>('GET', `/api/admin/history/${entry.id}`);
      setSnapshot(full.snapshot ?? '');
    }
    setOpen(o => !o);
  };

  return (
    <Paper withBorder bg="var(--ui-card-bg)" radius="var(--radius)" py={10} px={14}>
      <Group gap={8} wrap="nowrap" align="flex-start">
        <Badge color={meta.color} variant="light" miw={96} style={{ flexShrink: 0 }}>{meta.label}</Badge>
        <Box flex={1} miw={0}>
          <Text fw={600} fz={15} truncate>{entry.target_name || '(no name)'}</Text>
          <Text fz={13} c="dimmed">
            {entry.actor_name ? `@${entry.actor_name}` : 'system'} &middot; {parseDbTime(entry.created_at).toLocaleString()}
            {detail ? <> &middot; {detail}</> : null}
          </Text>
        </Box>
        {entry.has_snapshot && (
          <Button size="compact-xs" variant="subtle" onClick={toggle} style={{ flexShrink: 0 }}>
            {open ? 'Hide text' : entry.action === 'song.modified' ? 'Text before' : 'Saved text'}
          </Button>
        )}
      </Group>
      {open && snapshot !== null && (
        <Code block mt={8} mah={320} style={{ overflow: 'auto', whiteSpace: 'pre-wrap' }}>{snapshot}</Code>
      )}
    </Paper>
  );
}

/** The history log of song and user changes, newest first. Visible to admins and the super admin. */
export function AdminHistory({ refreshKey }: { refreshKey?: unknown }) {
  const apiCall = useApi();
  const { t } = useI18n();
  const [type, setType] = useState<'all' | 'song' | 'user'>('all');
  const [q, setQ] = useState('');
  const [debouncedQ] = useDebouncedValue(q, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryPage | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (type !== 'all') params.set('type', type);
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
    try {
      const res = await apiCall<HistoryPage>('GET', `/api/admin/history?${params}`);
      setData(Array.isArray(res?.entries) ? res : { entries: [], total: 0, page: 1, limit: PAGE_SIZE });
    } catch { /* shown as empty */ }
  }, [apiCall, page, type, debouncedQ]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <SectionTitle>{t('admin.history')}</SectionTitle>
      <Group gap="sm" mb={12} wrap="wrap">
        <SegmentedControl size="xs" value={type} onChange={(v) => { setType(v as typeof type); setPage(1); }}
          data={[{ label: 'All', value: 'all' }, { label: 'Songs', value: 'song' }, { label: 'Users', value: 'user' }]} />
        <TextInput size="xs" placeholder="Search song, user or who did it" value={q} aria-label="Search history"
          onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} flex="1 1 200px" />
      </Group>
      <Stack gap={8} mb={12}>
        {data?.entries.map(e => <HistoryRow key={e.id} entry={e} />)}
        {data && !data.entries.length && <Text c="dimmed" fz={14}>Nothing recorded yet.</Text>}
      </Stack>
      {pages > 1 && (
        <Group justify="center" gap="xs" mb={28}>
          <Button size="xs" variant="default" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Newer</Button>
          <Text fz={13} c="dimmed">Page {page} of {pages}</Text>
          <Button size="xs" variant="default" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Older</Button>
        </Group>
      )}
    </>
  );
}
