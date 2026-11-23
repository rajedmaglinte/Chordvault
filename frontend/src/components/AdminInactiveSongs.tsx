import { useCallback, useEffect, useState } from 'react';
import { Button, Group } from '@mantine/core';
import { SectionTitle } from './SectionTitle';
import { ListCard } from './ListCard';
import { CardGrid } from './CardGrid';
import { useApi } from '../hooks/useApi';
import { useBusyAction } from '../hooks/useBusyAction';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { confirmAction } from '../lib/errors';
import { showStatusNotification as toast } from '../lib/notifications';
import { formatDbDate } from '../lib/format';
import { isSuperAdmin } from '../lib/constants';
import type { InactiveSong } from '../types';

/** Deactivated songs: admins reactivate them; only the super admin deletes them for good. */
export function AdminInactiveSongs({ refreshKey, onChanged, onOpen }: { refreshKey?: unknown; onChanged: () => void; onOpen: (id: number) => void }) {
  const apiCall = useApi();
  const { user } = useAuth();
  const { t, tReplace } = useI18n();
  const { busy, run } = useBusyAction();
  const [songs, setSongs] = useState<InactiveSong[]>([]);
  const superAdmin = isSuperAdmin(user?.role);

  const load = useCallback(() => apiCall<InactiveSong[]>('GET', '/api/admin/songs/inactive').then(setSongs).catch(() => {}), [apiCall]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const reactivate = (s: InactiveSong) => run(async () => {
    await apiCall('PUT', `/api/admin/songs/${s.id}/active`, { active: true });
    toast(t('admin.songReactivated'), 'success');
    await load();
    onChanged();
  });

  const deleteForever = (s: InactiveSong) => confirmAction(tReplace('admin.confirmDeleteSong', { title: s.title }), () => run(async () => {
    await apiCall('DELETE', `/api/admin/songs/${s.id}`);
    toast(t('admin.songDeleted'), 'success');
    await load();
    onChanged();
  }));

  if (!songs.length) return null;
  return (
    <>
      <SectionTitle>{t('admin.inactiveSongs')} ({songs.length})</SectionTitle>
      <CardGrid mb={28}>
        {songs.map((s) => (
          <ListCard key={s.id} title={s.title}
            meta={<>{s.artist ? `${s.artist} · ` : ''}@{s.username} &middot; {s.deactivated_by ? `deactivated by @${s.deactivated_by} · ` : ''}{formatDbDate(s.updated_at)}</>}
            onClick={() => onOpen(s.id)}
            actions={
              <Group gap={6} onClick={(e) => e.stopPropagation()}>
                <Button size="xs" variant="default" disabled={busy} onClick={() => reactivate(s)}>{t('admin.reactivate')}</Button>
                {superAdmin && <Button size="xs" color="red" disabled={busy} onClick={() => deleteForever(s)}>{t('admin.deleteForever')}</Button>}
              </Group>
            } />
        ))}
      </CardGrid>
    </>
  );
}
