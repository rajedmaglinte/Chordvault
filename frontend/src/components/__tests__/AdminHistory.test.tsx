import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminHistory } from '../AdminHistory';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../hooks/useApi', () => ({ useApi: () => api }));
vi.mock('../../context/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k, tReplace: (k: string) => k }) }));

const entries = [
  { id: 3, created_at: '2026-11-22 10:00:00', actor_name: 'boss', action: 'song.deleted', target_type: 'song', target_id: 9, target_name: 'Old Hymn', details: { owner: 'alice' }, has_snapshot: true },
  { id: 2, created_at: '2026-11-22 09:00:00', actor_name: 'alice', action: 'song.modified', target_type: 'song', target_id: 9, target_name: 'Old Hymn', details: { fields: ['content', 'key'] }, has_snapshot: true },
  { id: 1, created_at: '2026-11-22 08:00:00', actor_name: 'leader', action: 'user.blocked', target_type: 'user', target_id: 4, target_name: 'carol', details: null, has_snapshot: false },
];

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((_m: string, path: string) => path.startsWith('/api/admin/history/')
    ? Promise.resolve({ ...entries[0], snapshot: '{title: Old Hymn}\n[G]Words' })
    : Promise.resolve({ entries, total: 3, page: 1, limit: 25 }));
});

it('lists what happened, who did it, and what changed', async () => {
  render(<AdminHistory />);
  expect(await screen.findByText('Deleted')).toBeInTheDocument();
  expect(screen.getByText('Modified')).toBeInTheDocument();
  expect(screen.getByText('Blocked')).toBeInTheDocument();
  expect(screen.getByText(/changed chords\/lyrics, key/)).toBeInTheDocument();
  expect(screen.getByText(/@leader/)).toBeInTheDocument();
});

it('shows the saved text of a deleted song on request', async () => {
  render(<AdminHistory />);
  fireEvent.click(await screen.findByRole('button', { name: 'Saved text' }));
  expect(await screen.findByText(/\[G\]Words/)).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith('GET', '/api/admin/history/3');
});

it('filters by songs or users', async () => {
  render(<AdminHistory />);
  await screen.findByText('Deleted');
  fireEvent.click(screen.getByText('Users'));
  await waitFor(() => expect(api).toHaveBeenLastCalledWith('GET', expect.stringContaining('type=user')));
});
