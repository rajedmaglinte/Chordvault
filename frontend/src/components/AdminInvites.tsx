import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CloseButton, Code, Divider, Group, NativeSelect, Paper, Stack, Switch, Text } from '@mantine/core';
import { SectionTitle } from './SectionTitle';
import { useApi } from '../hooks/useApi';
import { useBusyAction } from '../hooks/useBusyAction';
import { useCopyNotification } from '../hooks/useCopyNotification';
import { useDemo } from '../context/DemoContext';
import { useI18n } from '../context/I18nContext';
import { showStatusNotification as toast } from '../lib/notifications';
import { formatDbDate } from '../lib/format';
import type { AdminConfig, InviteCode, Church } from '../types';
import { useAuth } from '../context/AuthContext';
import { assignableRoles, isSiteOwner, ROLE_LABELS, ROLES } from '../lib/constants';

/** `refreshKey` changes when the admin view reloads, since deleting a user also deletes their pending invites. */
export function AdminInvites({ refreshKey, churches = [] }: { refreshKey?: unknown; churches?: Church[] }) {
  const apiCall = useApi();
  const { demoMode } = useDemo();
  const { t } = useI18n();
  const copyWithFeedback = useCopyNotification(t('admin.codeCopied'));
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const { busy, run } = useBusyAction();
  const { user } = useAuth();
  const owner = isSiteOwner(user?.role);
  const roles = assignableRoles(user);
  const [inviteRole, setInviteRole] = useState<string>(ROLES.USER);
  const [inviteChurch, setInviteChurch] = useState<string>('');
  const churchName = (id?: number | null) => churches.find(c => c.id === id)?.name ?? '';
  const disabled = demoMode || busy;
  const pending = invites.filter((i) => !i.used_at);

  const loadInvites = useCallback(() => apiCall<InviteCode[]>('GET', '/api/admin/invites').then(setInvites).catch(() => {}), [apiCall]);

  useEffect(() => { loadInvites(); }, [loadInvites, refreshKey]);

  useEffect(() => {
    apiCall<AdminConfig>('GET', '/api/admin/config').then(setConfig).catch(() => {});
  }, [apiCall]);

  const toggleReg = (allowRegistration: boolean) => run(async () => {
    await apiCall('PUT', '/api/admin/config', { allowRegistration });
    setConfig({ allowRegistration });
    toast(allowRegistration ? 'Registration enabled' : 'Registration disabled', 'success');
  });

  const generateInvite = () => run(async () => {
    const body: Record<string, unknown> = { role: inviteRole };
    if (owner && inviteChurch) body.church_id = Number(inviteChurch);
    const data = await apiCall<{ code: string }>('POST', '/api/admin/invites', body);
    setInviteCode(data.code);
    await loadInvites();
  });

  const deleteInvite = (id: number) => run(async () => {
    await apiCall('DELETE', `/api/admin/invites/${id}`);
    await loadInvites();
  });

  return (
    <>
      <SectionTitle>{t('admin.inviteUsers')}</SectionTitle>
      <Paper withBorder bg="var(--surface)" radius="var(--radius)" py={16} px={20} mb={20}>
        {(owner || demoMode) && (
        <Box mb={14}>
          {config && owner && (
            <>
              <Switch mb="sm" label="Open Registration" checked={config.allowRegistration} onChange={(e) => toggleReg(e.target.checked)} disabled={disabled} />
              <Text fz={13} c="dimmed" mt={4}>
                {config.allowRegistration ? 'Anyone can create an account — no email verification, so open to spam. Use invite codes instead.' : 'Registration is closed. Use invite codes to add new users.'}
              </Text>
            </>
          )}
          {demoMode && <Text fz={12} c="dimmed" mt={4}>{t('common.demoDisabled')}</Text>}
        </Box>
        )}
        <Stack gap={14}>{owner && <Divider />}
          <Group gap={12} align="flex-end">
            {roles.length > 1 && (
              <NativeSelect label="Role" size="sm" value={inviteRole} onChange={e => setInviteRole(e.currentTarget.value)} disabled={disabled}
                data={roles.map(r => ({ value: r, label: ROLE_LABELS[r] }))} />
            )}
            {owner && churches.length > 1 && (
              <NativeSelect label="Church" size="sm" value={inviteChurch} onChange={e => setInviteChurch(e.currentTarget.value)} disabled={disabled}
                data={[{ value: '', label: user?.church_name ? `${user.church_name} (yours)` : 'Your church' }, ...churches.filter(c => c.id !== user?.church_id).map(c => ({ value: String(c.id), label: c.name }))]} />
            )}
            <Button onClick={generateInvite} disabled={disabled} title={demoMode ? t('common.demoDisabled') : ''}>{t('admin.generateInvite')}</Button>
            {inviteCode && (
              <Group gap={8}>
                <Code fz={18} fw={600} py={6} px={14} bg="var(--accent-bg)" lts="0.08em" style={{ userSelect: 'all' }}>{inviteCode}</Code>
                <Button variant="default" size="xs" onClick={() => copyWithFeedback(inviteCode)}>{t('admin.copy')}</Button>
              </Group>
            )}
          </Group>
          <Text fz={13} c="dimmed" mt={8}>Generate a single-use code and share it. The person enters it on the sign-in page to create their account.</Text>
          {pending.length > 0 && (
            <Stack gap={6} mt={12}><Divider />
              <Text fz={12} c="dimmed" mb={6} tt="uppercase" lts="0.06em" fw={600}>{t('admin.pendingInvites')}</Text>
              {pending.map((inv) => (
                <Group key={inv.id} gap={8} mb={4}>
                  <Text span ff="monospace" fz={13}>{inv.code}</Text>
                  <Text span fz={12} c="dimmed">{formatDbDate(inv.created_at)}{inv.role && inv.role !== ROLES.USER ? ` · ${ROLE_LABELS[inv.role]}` : ''}{owner && (inv.church_name || churchName(inv.church_id)) ? ` · ${inv.church_name || churchName(inv.church_id)}` : ''}</Text>
                  <CloseButton aria-label={t('admin.delete')} onClick={() => deleteInvite(inv.id)} disabled={disabled} />
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </>
  );
}
