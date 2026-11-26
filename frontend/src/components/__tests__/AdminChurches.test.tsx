import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminChurches } from '../AdminChurches';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../hooks/useApi', () => ({ useApi: () => api }));
vi.mock('../../context/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k, tReplace: (k: string) => k }) }));
vi.mock('../../hooks/useCopyNotification', () => ({ useCopyNotification: () => vi.fn() }));

const churches = [
  { id: 1, name: 'My Church', created_at: '2026-11-01', member_count: 5, super_admin: 'rajed' },
  { id: 2, name: 'Grace Church', created_at: '2026-11-20', member_count: 0, super_admin: null },
];

beforeEach(() => api.mockReset());

it('lists churches with their members and super admin', () => {
  render(<AdminChurches churches={churches} onChanged={vi.fn()} />);
  expect(screen.getByText(/5 members · super admin @rajed/)).toBeInTheDocument();
  expect(screen.getByText(/0 members · no super admin yet/)).toBeInTheDocument();
});

it('adds a church and shows the invite code for its super admin', async () => {
  api.mockResolvedValueOnce({ church: { id: 3, name: 'Hope Church' }, code: 'abc123abc123abcd' });
  const onChanged = vi.fn();
  render(<AdminChurches churches={churches} onChanged={onChanged} />);
  fireEvent.change(screen.getByLabelText('Add a church'), { target: { value: 'Hope Church' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add church' }));
  expect(await screen.findByText('abc123abc123abcd')).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith('POST', '/api/admin/churches', { name: 'Hope Church' });
  expect(onChanged).toHaveBeenCalled();
});

it('renames a church', async () => {
  api.mockResolvedValueOnce({ success: true });
  const onChanged = vi.fn();
  render(<AdminChurches churches={churches} onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: 'Rename My Church' }));
  fireEvent.change(screen.getByLabelText('New name for My Church'), { target: { value: 'Magrem Worship' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('PUT', '/api/admin/churches/1', { name: 'Magrem Worship' }));
  expect(onChanged).toHaveBeenCalled();
});
