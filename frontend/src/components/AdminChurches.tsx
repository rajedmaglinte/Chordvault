import { useState } from 'react';
import { Button, Code, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { SectionTitle } from './SectionTitle';
import { useApi } from '../hooks/useApi';
import { useBusyAction } from '../hooks/useBusyAction';
import { useCopyNotification } from '../hooks/useCopyNotification';
import { useI18n } from '../context/I18nContext';
import { notifyError } from '../lib/errors';
import { formatDbDate } from '../lib/format';
import type { Church } from '../types';

/**
 * The owner's list of churches. Adding one returns an invite code for that church's super admin,
 * who then invites their own members. Public songs are shared by every church.
 */
export function AdminChurches({ churches, onChanged }: { churches: Church[]; onChanged: () => void }) {
  const apiCall = useApi();
  const { t } = useI18n();
  const copy = useCopyNotification(t('admin.codeCopied'));
  const { busy, run } = useBusyAction();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ church: string; code: string } | null>(null);

  const add = () => run(async () => {
    try {
      const res = await apiCall<{ church: { name: string }; code: string }>('POST', '/api/admin/churches', { name });
      setCreated({ church: res.church.name, code: res.code });
      setName('');
      onChanged();
    } catch (e) { notifyError(e); }
  });

  return (
    <>
      <SectionTitle>Churches ({churches.length})</SectionTitle>
      <Paper withBorder bg="var(--surface)" radius="var(--radius)" py={16} px={20} mb={20}>
        <Text fz={13} c="dimmed" mb={12}>
          Every church uses this same site. Public songs are shared by all churches; members, setlists, live sync and history are kept per church.
        </Text>
        <Stack gap={6} mb={14}>
          {churches.map(c => (
            <Group key={c.id} justify="space-between" gap={8} wrap="nowrap">
              <Text fw={600} truncate>{c.name}</Text>
              <Text fz={13} c="dimmed" ta="right">
                {c.member_count} member{c.member_count === 1 ? '' : 's'}
                {c.super_admin ? ` · super admin @${c.super_admin}` : ' · no super admin yet'}
                {` · since ${formatDbDate(c.created_at)}`}
              </Text>
            </Group>
          ))}
        </Stack>
        <Group gap={8} align="flex-end">
          <TextInput label="Add a church" placeholder="e.g. Grace Christian Church" value={name} flex="1 1 220px"
            onChange={e => setName(e.currentTarget.value)} disabled={busy} maxLength={80} />
          <Button onClick={add} disabled={busy || name.trim().length < 2}>Add church</Button>
        </Group>
        {created && (
          <Paper withBorder mt={14} p={12} radius="var(--radius)" bg="var(--accent-bg)" role="status">
            <Text fw={600} mb={6}>{created.church} was added.</Text>
            <Text fz={13} mb={8}>
              Send this one-time invite code to the person who will run it. They open this site, choose Sign in, then
              &ldquo;Have an invite code?&rdquo;, and become that church&rsquo;s super admin.
            </Text>
            <Group gap={8}>
              <Code fz={18} fw={600} py={6} px={14} lts="0.08em" style={{ userSelect: 'all' }}>{created.code}</Code>
              <Button variant="default" size="xs" onClick={() => copy(created.code)}>{t('admin.copy')}</Button>
            </Group>
          </Paper>
        )}
      </Paper>
    </>
  );
}
