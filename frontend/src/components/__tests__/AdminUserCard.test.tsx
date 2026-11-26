import { fireEvent, render, screen } from '@testing-library/react';
import { AdminUserCard } from '../AdminUserCard';
import type { AdminUser, User } from '../../types';

const { demo } = vi.hoisted(() => ({ demo: { demoMode: false } }));
vi.mock('../../context/DemoContext', () => ({ useDemo: () => demo }));
vi.mock('../../context/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k, tReplace: (k: string) => k }) }));

const owner: User = { id: 1, username: 'boss', role: 'owner', token: 't', church_id: 1 };
const admin: User = { id: 5, username: 'helper', role: 'admin', token: 't', church_id: 1 };
const superAdmin: User = { id: 6, username: 'lead', role: 'church_owner', token: 't', church_id: 1 };
const member: AdminUser = { id: 2, username: 'member', role: 'user', disabled: false, song_count: 3, created_at: '2026-01-01', church_id: 1, church_name: 'My Church' };
const handlers = { onSetRole: vi.fn(), onResetPassword: vi.fn(), onSetDisabled: vi.fn(), onDelete: vi.fn() };

beforeEach(() => { demo.demoMode = false; Object.values(handlers).forEach(h => h.mockReset()); });
const renderCard = (target: AdminUser, actor: User | null = owner, showChurch = false) =>
  render(<AdminUserCard target={target} actor={actor} busy={false} showChurch={showChurch} {...handlers} />);

it('passes the target to each action', () => {
  renderCard(member);
  fireEvent.click(screen.getByRole('button', { name: 'admin.promote' }));
  expect(handlers.onSetRole).toHaveBeenCalledExactlyOnceWith(2, 'admin');
  fireEvent.click(screen.getByRole('button', { name: 'admin.resetPassword' }));
  expect(handlers.onResetPassword).toHaveBeenCalledExactlyOnceWith(2, 'member');
  fireEvent.click(screen.getByRole('button', { name: 'admin.disable' }));
  expect(handlers.onSetDisabled).toHaveBeenCalledExactlyOnceWith(2, true);
  fireEvent.click(screen.getByRole('button', { name: 'admin.deleteForever' }));
  expect(handlers.onDelete).toHaveBeenCalledExactlyOnceWith(2, 'member');
});

it('lets admins block but not delete users', () => {
  renderCard(member, admin);
  fireEvent.click(screen.getByRole('button', { name: 'admin.disable' }));
  expect(handlers.onSetDisabled).toHaveBeenCalledExactlyOnceWith(2, true);
  expect(screen.queryByRole('button', { name: 'admin.deleteForever' })).not.toBeInTheDocument();
});

it('offers demote for an admin and enable for a disabled user', () => {
  renderCard({ ...member, role: 'admin', disabled: true });
  fireEvent.click(screen.getByRole('button', { name: 'admin.demote' }));
  expect(handlers.onSetRole).toHaveBeenCalledExactlyOnceWith(2, 'user');
  fireEvent.click(screen.getByRole('button', { name: 'admin.enable' }));
  expect(handlers.onSetDisabled).toHaveBeenCalledExactlyOnceWith(2, false);
  expect(screen.getByText('Blocked')).toBeInTheDocument();
  expect(screen.getByText('Admin')).toBeInTheDocument();
});

it('leaves role changes to the owner', () => {
  renderCard(member, admin);
  expect(screen.queryByRole('button', { name: 'admin.promote' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'admin.resetPassword' })).toBeInTheDocument();
});

it.each([
  ['the owner', { ...member, role: 'owner' }, owner],
  ['an admin managed by an admin', { ...member, role: 'admin' }, admin],
  ['yourself', { ...member, id: 1 }, owner],
  ['nobody signed in', member, null],
])('shows no actions for %s', (_label, target, actor) => {
  renderCard(target, actor);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

it('shows no actions in demo mode', () => {
  demo.demoMode = true;
  renderCard(member);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

it('labels your own card', () => {
  renderCard({ ...member, id: 1, username: 'boss' });
  expect(screen.getByText(/admin\.you/)).toBeInTheDocument();
  expect(screen.getByText('@boss', { exact: false })).toBeInTheDocument();
});

it('the owner can make someone a church super admin and sees their church', () => {
  renderCard({ ...member, church_name: 'Grace Church', church_id: 2 }, owner, true);
  expect(screen.getByText(/Grace Church/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Make church super admin' }));
  expect(handlers.onSetRole).toHaveBeenCalledExactlyOnceWith(2, 'church_owner');
});

it('a church super admin promotes and deletes in their church, but cannot make super admins', () => {
  renderCard({ ...member, role: 'admin' }, superAdmin);
  expect(screen.getByRole('button', { name: 'admin.demote' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'admin.deleteForever' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Make church super admin' })).not.toBeInTheDocument();
});

it('shows no actions for someone in another church', () => {
  renderCard({ ...member, church_id: 2 }, superAdmin);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
