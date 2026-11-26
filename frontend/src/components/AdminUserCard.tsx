import { Badge, Box, Button, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import { CardTitle } from './CardTitle';
import { CardMeta } from './CardMeta';
import { useDemo } from '../context/DemoContext';
import { useI18n } from '../context/I18nContext';
import { ROLES, ROLE_LABELS, isSuperAdmin, isSiteOwner, assignableRoles, manageUserError } from '../lib/constants';
import { formatDbDate, formatSongCount } from '../lib/format';
import type { AdminUser, User } from '../types';

interface AdminUserCardProps {
  target: AdminUser;
  actor: User | null;
  busy: boolean;
  onSetRole: (userId: number, role: string) => void;
  onResetPassword: (userId: number, username: string) => void;
  onSetDisabled: (userId: number, disabled: boolean) => void;
  onDelete: (userId: number, username: string) => void;
  /** Show which church the account belongs to (the owner sees every church). */
  showChurch?: boolean;
}

export function AdminUserCard({ target, actor, busy, onSetRole, onResetPassword, onSetDisabled, onDelete, showChurch }: AdminUserCardProps) {
  const { demoMode } = useDemo();
  const { t } = useI18n();
  const showActions = !!actor && !manageUserError(actor, target) && !demoMode;
  const isTargetAdmin = target.role === ROLES.ADMIN;
  const roles = assignableRoles(actor);
  const owner = isSiteOwner(actor?.role);

  return (
    <Paper withBorder bg="var(--ui-card-bg)" radius="var(--radius)" py={16} px={20} shadow="sm">
      <Group justify="space-between" gap={12}>
        <Box flex="1 1 180px" miw={0}>
          <CardTitle>@{target.username}{target.id === actor?.id && <Text span inherit c="dimmed" fz={13}> {t('admin.you')}</Text>}</CardTitle>
          <CardMeta>{showChurch && target.church_name ? <>{target.church_name} &middot; </> : null}{formatSongCount(target.song_count, t)} &middot; {t('admin.joined')} {formatDbDate(target.created_at)}</CardMeta>
        </Box>
        <Group gap={6}>
          {target.role !== ROLES.USER && <Badge>{ROLE_LABELS[target.role]}</Badge>}
          {target.disabled && <Badge color="red">Blocked</Badge>}
        </Group>
      </Group>
      {showActions && (
        <Stack gap={10} mt={10}><Divider /><Group gap={6}>
          {target.role === ROLES.USER && roles.includes(ROLES.ADMIN) && (
            <Button variant="default" size="xs" disabled={busy} onClick={() => onSetRole(target.id, ROLES.ADMIN)}>{t('admin.promote')}</Button>
          )}
          {isTargetAdmin && roles.includes(ROLES.ADMIN) && (
            <Button variant="default" size="xs" disabled={busy} onClick={() => onSetRole(target.id, ROLES.USER)}>{t('admin.demote')}</Button>
          )}
          {owner && target.role !== ROLES.CHURCH_OWNER && (
            <Button variant="default" size="xs" disabled={busy} onClick={() => onSetRole(target.id, ROLES.CHURCH_OWNER)}>Make church super admin</Button>
          )}
          {owner && target.role === ROLES.CHURCH_OWNER && (
            <Button variant="default" size="xs" disabled={busy} onClick={() => onSetRole(target.id, ROLES.ADMIN)}>Make admin</Button>
          )}
          <Button variant="default" size="xs" disabled={busy} onClick={() => onResetPassword(target.id, target.username)}>{t('admin.resetPassword')}</Button>
          <Button variant={target.disabled ? 'filled' : 'default'} color={target.disabled ? undefined : 'orange'} size="xs" disabled={busy} onClick={() => onSetDisabled(target.id, !target.disabled)}>{target.disabled ? t('admin.enable') : t('admin.disable')}</Button>
          {isSuperAdmin(actor.role) && <Button color="red" size="xs" disabled={busy} onClick={() => onDelete(target.id, target.username)}>{t('admin.deleteForever')}</Button>}
        </Group></Stack>
      )}
    </Paper>
  );
}
