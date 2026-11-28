import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { TestWrapper } from '../../test/wrappers';
import { tapTempo, clampBpm, useMetronome } from '../useMetronome';
import { MetronomeControl } from '../../components/MetronomeControl';

describe('tap tempo', () => {
  it('averages the gaps between taps', () => {
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempo([0, 1000])).toBe(60);
    expect(tapTempo([0])).toBeNull();
  });
  it('starts over after a long pause', () => {
    expect(tapTempo([0, 500, 5000, 5750])).toBe(80);
  });
  it('keeps tempos in range', () => {
    expect(clampBpm(5)).toBe(30);
    expect(clampBpm(999)).toBe(250);
    expect(tapTempo([0, 10, 20])).toBe(250);
  });
});

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

describe('metronome', () => {
  beforeEach(() => {
    FakeAudioContext.clicks = [];
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    localStorage.clear();
  });

  it("starts at the song's tempo and adjusts", () => {
    const { result } = renderHook(() => useMetronome(72));
    expect(result.current.bpm).toBe(72);
    act(() => result.current.nudge(5));
    expect(result.current.bpm).toBe(77);
    act(() => result.current.resetToSong());
    expect(result.current.bpm).toBe(72);
  });

  it('schedules clicks with an accented first beat, and stops for a new song', () => {
    const { result, rerender } = renderHook(({ bpm }) => useMetronome(bpm), { initialProps: { bpm: 120 } });
    act(() => result.current.start());
    expect(result.current.running).toBe(true);
    expect(FakeAudioContext.clicks.length).toBeGreaterThan(0);
    expect(FakeAudioContext.clicks[0].freq).toBe(1500);
    rerender({ bpm: 90 });
    expect(result.current.running).toBe(false);
    expect(result.current.bpm).toBe(90);
  });

  it('stays silent in light-only mode', () => {
    const { result } = renderHook(() => useMetronome(100));
    act(() => result.current.setSound(false));
    act(() => result.current.start());
    expect(FakeAudioContext.clicks).toHaveLength(0);
    act(() => result.current.stop());
  });

  it('the button shows the tempo and opens the controls', async () => {
    function Harness() { return <MetronomeControl m={useMetronome(84)} />; }
    render(<TestWrapper><Harness /></TestWrapper>);
    fireEvent.click(screen.getByRole('button', { name: /Metronome, 84 beats per minute/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Faster by 5' }));
    expect(screen.getByRole('button', { name: /Metronome, 89 beats per minute/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  });
});
