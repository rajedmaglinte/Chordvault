import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { TestWrapper } from '../../test/wrappers';
import { clampBpm, useMetronome } from '../useMetronome';
import { MetronomeControl } from '../../components/MetronomeControl';
import { EntryMetronomeButton } from '../../components/EntryMetronomeButton';
import type { SetlistEntry } from '../../types';

/** A stand-in for the Web Audio API that records scheduled clicks. */
class FakeAudioContext {
  static clicks: { time: number; freq: number }[] = [];
  currentTime = 0;
  destination = {};
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d };
  }
  createOscillator() {
    const osc = { frequency: { value: 0 }, connect: (g: { connect: (d: unknown) => unknown }) => g, start: (time: number) => FakeAudioContext.clicks.push({ time, freq: osc.frequency.value }), stop() {} };
    return osc;
  }
}

beforeEach(() => {
  FakeAudioContext.clicks = [];
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  localStorage.clear();
});

describe('metronome', () => {
  it('keeps tempos in range', () => {
    expect(clampBpm(5)).toBe(30);
    expect(clampBpm(999)).toBe(250);
  });

  it("uses the song's tempo and beats, accenting the first beat", () => {
    const { result } = renderHook(() => useMetronome(120, 3));
    expect(result.current.bpm).toBe(120);
    expect(result.current.beatsPerBar).toBe(3);
    act(() => result.current.start());
    expect(result.current.running).toBe(true);
    expect(FakeAudioContext.clicks[0].freq).toBe(1500);
    act(() => result.current.stop());
  });

  it('stops and loads the next tempo when the song changes', () => {
    const { result, rerender } = renderHook(({ bpm }) => useMetronome(bpm), { initialProps: { bpm: 120 } });
    act(() => result.current.start());
    rerender({ bpm: 90 });
    expect(result.current.running).toBe(false);
    expect(result.current.bpm).toBe(90);
  });

  it('stays silent in light-only mode, remembered for next time', () => {
    const first = renderHook(() => useMetronome(100));
    act(() => first.result.current.setSound(false));
    first.unmount();
    const { result } = renderHook(() => useMetronome(100));
    expect(result.current.sound).toBe(false);
    act(() => result.current.start());
    expect(FakeAudioContext.clicks).toHaveLength(0);
    act(() => result.current.stop());
  });

  it('the player button is tap to start, tap to stop, with nothing opening over the lyrics', () => {
    function Harness() { return <MetronomeControl m={useMetronome(84)} />; }
    render(<TestWrapper><Harness /></TestWrapper>);
    fireEvent.click(screen.getByRole('button', { name: 'Start metronome at 84 bpm' }));
    expect(screen.getByRole('button', { name: 'Stop metronome (84 bpm)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop metronome (84 bpm)' }));
    expect(screen.getByRole('button', { name: 'Start metronome at 84 bpm' })).toBeInTheDocument();
  });
});

describe('metronome per song in the setlist editor', () => {
  const entry = { entry_id: 7, song_id: 1, title: 'Open The Eyes', artist: '', content: '', content_override: null, target_key: null, nashville: 0, bpm: 72, youtube_url: null, language: 'en' } as SetlistEntry;

  it("saves a tempo and beats per bar, storing nothing when it matches the song's own", async () => {
    const onSave = vi.fn();
    render(<TestWrapper><EntryMetronomeButton entry={entry} onSave={onSave} /></TestWrapper>);
    fireEvent.click(screen.getByRole('button', { name: /Metronome for Open The Eyes: 72 bpm/ }));
    const tempo = await screen.findByLabelText(/Tempo \(bpm\)/);
    fireEvent.change(tempo, { target: { value: '76' } });
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ metronome_bpm: 76, metronome_beats: 3 });
  });

  it("can go back to the song's tempo", async () => {
    const onSave = vi.fn();
    render(<TestWrapper><EntryMetronomeButton entry={{ ...entry, metronome_bpm: 80, metronome_beats: 6 }} onSave={onSave} /></TestWrapper>);
    fireEvent.click(screen.getByRole('button', { name: /80 bpm, 6 beats per bar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Use song/ }));
    expect(onSave).toHaveBeenCalledWith({ metronome_bpm: null, metronome_beats: null });
  });
});
