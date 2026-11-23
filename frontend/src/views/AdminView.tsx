import { Badge, Box, Button, Group } from '@mantine/core';
import { SectionTitle } from '../components/SectionTitle';
import { ListCard } from '../components/ListCard';
import { CardGrid } from '../components/CardGrid';
import { modals } from '@mantine/modals';
import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useBusyAction } from '../hooks/useBusyAction';
import { confirmAction, notifyError } from '../lib/errors';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { showStatusNotification as toast } from '../lib/notifications';
import { Loading } from '../components/Loading';
import type { AdminStats, AdminUser, Correction } from '../types';
import { languageName } from '../lib/languages';
import { PageTitle } from '../components/PageTitle';
import { AdminTags } from '../components/AdminTags';
import { AdminInvites } from '../components/AdminInvites';
import { AdminUserCard } from '../components/AdminUserCard';
import { AdminInactiveSongs } from '../components/AdminInactiveSongs';
import { AdminHistory } from '../components/AdminHistory';
import { StatCard } from '../components/StatCard';
import { StatGrid } from '../components/StatGrid';
import { ROLES, ROLE_LABELS } from '../lib/constants';
import { formatDbDate } from '../lib/format';
import type { Navigate } from '../lib/routes';

interface AdminViewProps {
  navigate: Navigate;
}

export function AdminView({ navigate }: AdminViewProps) {
  const apiCall = useApi();
  const { user, isAdmin } = useAuth();
  const { t, tReplace } = useI18n();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const { busy, run: runAction } = useBusyAction();
  const [reloads, setReloads] = useState(0);

  const load = useCallback(async () => {
    try {
      const [s, u, c] = await Promise.all([
        apiCall<AdminStats>('GET', '/api/admin/stats'),
        apiCall<AdminUser[]>('GET', '/api/admin/users'),
        apiCall<Correction[]>('GET', '/api/admin/corrections'),
      ]);
      setStats(s); setUsers(u); setCorrections(c); setReloads(n => n + 1);
    } catch (e) { notifyError(e); navigate('my-songs', {}, { leave: true }); }
  }, [apiCall, navigate]);

  useEffect(() => {
    if (!isAdmin) { navigate('my-songs', {}, { leave: true }); return; }
    load();
  }, [isAdmin, navigate, load]);

  const confirmThenReload = (message: string, request: () => Promise<unknown>, successText: string) =>
    confirmAction(message, () => runAction(async () => {
      await request();
      toast(successText, 'success');
      await load();
    }));

  const setRole = (userId: number, role: string) => {
    const promote = role === ROLES.ADMIN;
    confirmThenReload(promote ? t('admin.confirmPromote') : t('admin.confirmDemote'),
      () => apiCall('PUT', `/api/admin/users/${userId}/role`, { role }), promote ? t('admin.userPromoted') : t('admin.userDemoted'));
  };

  const setDisabled = (userId: number, disabled: boolean) => confirmThenReload(disabled ? t('admin.confirmDisable') : t('admin.confirmEnable'),
    () => apiCall('PUT', `/api/admin/users/${userId}/disabled`, { disabled }), disabled ? t('admin.userDisabled') : t('admin.userEnabled'));

  const deleteUser = (userId: number, username: string) => confirmThenReload(tReplace('admin.confirmDeleteUser', { username }),
    () => apiCall('DELETE', `/api/admin/users/${userId}`), t('admin.userDeleted'));

  // Admins deactivate; the super admin can delete for good from the Deactivated songs list.
  const deactivateSong = (songId: number, title: string) => confirmThenReload(tReplace('admin.confirmDeactivateSong', { title }),
    () => apiCall('PUT', `/api/admin/songs/${songId}/active`, { active: false }), t('admin.songDeactivated'));

  const resetPassword = (userId: number, username: string) => modals.openContextModal({ modal: 'resetPassword', title: tReplace('admin.resetPasswordPrompt', { username }), innerProps: { onSubmit: (newPassword: string) => runAction(async () => {
    await apiCall('PUT', `/api/admin/users/${userId}/password`, { password: newPassword });
    toast(t('admin.passwordReset'), 'success');
  }) } });

  if (!stats) return <Loading />;

  return (
    <>
      <Group justify="space-between" mb="lg">
        <PageTitle className="view-title">{t('admin.title')}</PageTitle>
        {user && <Badge size="lg" variant="light">{ROLE_LABELS[user.role]}</Badge>}
      </Group>
      <StatGrid>
        <StatCard value={stats.userCount} label={t('admin.users')} />
        <StatCard value={stats.songCount} label={t('admin.songs')} />
        {stats.pendingCount > 0 && <StatCard value={stats.pendingCount} label="Pending corrections" />}
        {stats.noFormatCount > 0 && <StatCard value={stats.noFormatCount} label="No chords detected" />}
      </StatGrid>

      {stats.languageDistribution && stats.languageDistribution.length > 0 && (
        <Box mt={16}>
          <SectionTitle>Languages</SectionTitle>
          <StatGrid>
            {stats.languageDistribution.map(({ language, count }) => (
              <StatCard key={language} value={count} label={language ? languageName(language) : 'Not set'} />
            ))}
          </StatGrid>
        </Box>
      )}

      <AdminInvites refreshKey={users} />

      <AdminTags />

      <SectionTitle>{t('admin.users')}</SectionTitle>

      <CardGrid mb={28}>
        {users.map((u) => (
          <AdminUserCard key={u.id} target={u} actor={user} busy={busy}
            onSetRole={setRole} onResetPassword={resetPassword} onSetDisabled={setDisabled} onDelete={deleteUser} />
        ))}
      </CardGrid>

      {stats.recentSongs.length > 0 && (
        <>
          <SectionTitle>{t('admin.recentSongs')}</SectionTitle>
          <CardGrid>
            {stats.recentSongs.map((s) => (
              <ListCard
                key={s.id}
                title={s.title}
                meta={<>{s.artist ? `${s.artist} · ` : ''}@{s.username} &middot; {formatDbDate(s.created_at)}</>}
                onClick={() => navigate('song-view', { id: String(s.id) })}
                actions={<Button color="orange" variant="light" size="xs" disabled={busy} onClick={(e) => { e.stopPropagation(); deactivateSong(s.id, s.title); }}>{t('admin.deactivate')}</Button>}
              />
            ))}
          </CardGrid>
        </>
      )}

      <AdminInactiveSongs refreshKey={reloads} onChanged={() => void load()} onOpen={(id) => navigate('song-view', { id: String(id) })} />

      {corrections.length > 0 && (
        <>
          <SectionTitle>{tReplace('admin.pendingCorrections', { count: corrections.length })}</SectionTitle>
          <CardGrid>
            {corrections.map((c) => (
              <ListCard
                key={c.id}
                title={c.title}
                meta={<>by @{c.submitter} &middot; {formatDbDate(c.created_at)}</>}
                onClick={() => navigate('song-view', { id: String(c.parent_id) })}
                actions={<Badge color="yellow">pending</Badge>}
              />
            ))}
          </CardGrid>
        </>
      )}

      <Box mt={28}><AdminHistory refreshKey={reloads} /></Box>
    </>
  );
}
