import { fireEvent, render, screen } from '@testing-library/react';
import { Mock } from 'vitest';
import { SetlistPlayView } from '../SetlistPlayView';
import { useSetlistPlayer } from '../../hooks/useSetlistPlayer';

const layout = vi.hoisted(() => ({ current: 'phone' as 'desktop' | 'tablet' | 'phone' }));
vi.mock('../../hooks/usePlaybackLayout', () => ({ usePlaybackLayout: () => layout.current }));
vi.mock('../../hooks/useSetlistPlayer', () => ({ useSetlistPlayer: vi.fn() }));
const columns = vi.hoisted(() => ({ twoCol: false }));
vi.mock('../../hooks/useTwoCol', () => ({ useTwoCol: () => ({ twoCol: columns.twoCol, toggleTwoCol: vi.fn(), setTwoColTo: vi.fn() }) }));
vi.mock('../../hooks/useApi', () => ({ useApi: () => vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('../../context/I18nContext', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('../../lib/notifications', () => ({ showStatusNotification: vi.fn() }));
vi.mock('../../hooks/useSwipe', () => ({ useSwipe: vi.fn() }));
vi.mock('../../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
const narrow = vi.hoisted(() => ({ current: false }));
vi.mock('@mantine/hooks', async (orig) => ({
  ...(await orig<typeof import('@mantine/hooks')>()),
  useMediaQuery: (q: string, ...rest: unknown[]) => (q === '(max-width: 379px)' ? narrow.current : (rest[0] as boolean | undefined) ?? false),
}));

const LONG = '奇異恩典 Amazing Grace (中英雙語版 bilingual arrangement)';

beforeEach(() => {
  columns.twoCol = false;
  narrow.current = false;
  (useSetlistPlayer as Mock).mockReturnValue({
    setlist: { id: 1, name: 'Sunday worship', entries: [] },
    entry: { entry_id: 1, title: LONG, content: '{key: G}\n[G]Amazing grace' },
    index: 0, total: 4, prev: vi.fn(), next: vi.fn(), exit: vi.fn(),
    updateEntry: vi.fn(), isModified: false, saveOnline: vi.fn(), saveLocal: vi.fn(),
  });
});

describe('playback layouts', () => {
  it('phone: one slim dock row with prev and next, swipe-proof', () => {
    layout.current = 'phone';
    const { container } = render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    const dock = container.querySelector('.playback-dock')!;
    expect(dock).toHaveAttribute('data-no-swipe');
    expect(screen.getByRole('button', { name: 'Previous Song' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next Song' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Multi-column layout' })).toBeNull();
  });

  it('phone: text size and fit leave the playing screen for the Settings sheet; keys are set in the setlist', async () => {
    layout.current = 'phone';
    const { container } = render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    const dock = container.querySelector('.playback-dock')!;
    for (const name of ['Increase font size', 'Fit', 'Multi-column layout']) {
      expect(dock.querySelector(`[aria-label="${name}"]`)).toBeNull();
    }
    expect(dock.querySelector('[data-testid="key-display"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings: text size and more' }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent('This song');
    expect(screen.queryByRole('group', { name: 'Transpose key' })).toBeNull();
    expect(sheet).toHaveTextContent('Keys and metronome tempos are set per song in the setlist');
    expect(screen.getByRole('button', { name: 'Increase font size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit' })).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Setlist defaults for all songs');
  });

  it('tablet: the Settings sheet also has the columns toggle', async () => {
    layout.current = 'tablet';
    render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Multi-column layout' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings: text size and more' }));
    expect(await screen.findByRole('button', { name: 'Multi-column layout' })).toBeInTheDocument();
  });

  it('phone: the metronome shows only for songs whose tempo was set in the setlist', () => {
    layout.current = 'phone';
    const { unmount } = render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /metronome/i })).toBeNull();
    unmount();
    (window as unknown as { AudioContext: unknown }).AudioContext = class {};
    const player = (useSetlistPlayer as Mock)();
    (useSetlistPlayer as Mock).mockReturnValue({ ...player, entry: { ...player.entry, metronome_bpm: 74 } });
    render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start metronome at 74 bpm' })).toBeInTheDocument();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('phone: the top bar shows the key under the title', () => {
    layout.current = 'phone';
    render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(screen.getByText('1 of 4 \u00b7 Key G')).toBeInTheDocument();
  });

  it('desktop: no dock, toolbar sits in the top bar', () => {
    layout.current = 'desktop';
    const { container } = render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(container.querySelector('.playback-dock')).toBeNull();
    expect(container.querySelector('.playback-topbar [role="group"][aria-label="Display"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
  });

  it('desktop: shows the tempo and YouTube link in the top bar', () => {
    layout.current = 'desktop';
    (useSetlistPlayer as Mock).mockReturnValue({
      setlist: { id: 1, name: 'Sunday worship', entries: [] },
      entry: { entry_id: 1, title: 'It Is Well', content: '{key: C}\n[C]When peace', bpm: 72, youtube_url: 'https://youtube.com/watch?v=abc' },
      index: 0, total: 4, prev: vi.fn(), next: vi.fn(), exit: vi.fn(),
      updateEntry: vi.fn(), isModified: false, saveOnline: vi.fn(), saveLocal: vi.fn(),
    });
    render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(screen.getByText('72 bpm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute('href', 'https://youtube.com/watch?v=abc');
  });

  it.each(['desktop', 'tablet', 'phone'] as const)('%s: a swipe on the top bar cannot change songs', (l) => {
    layout.current = l;
    const { container } = render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(container.querySelector('.playback-topbar')).toHaveAttribute('data-no-swipe');
  });

  it('phone: a per-song number notation override shows in the More menu', async () => {
    layout.current = 'phone';
    const player = (useSetlistPlayer as Mock)();
    (useSetlistPlayer as Mock).mockReturnValue({ ...player, entry: { ...player.entry, _num: 1 } });
    render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'More display options' }));
    expect(await screen.findByRole('menuitem', { name: 'Number notation, on' })).toBeInTheDocument();
  });

  it('tablet: Reset stays off until this song has its own text size or columns', async () => {
    layout.current = 'tablet';
    columns.twoCol = true;
    render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'More display options' }));
    expect(await screen.findByRole('menuitem', { name: 'Reset text size and columns' })).toHaveAttribute('data-disabled', 'true');
  });

  it('shows the full title and position without truncating', () => {
    layout.current = 'desktop';
    render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(LONG);
    expect(screen.getByText('1 of 4, Sunday worship')).toBeInTheDocument();
  });

  it('keeps the exit hook the smoke test uses', () => {
    const { container } = render(<SetlistPlayView setlistId={1} navigate={vi.fn()} />);
    expect(container.querySelector('button.btn-exit')).not.toBeNull();
  });
});
