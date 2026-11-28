import { useCallback, useEffect, useRef, useState } from 'react';

export const MIN_BPM = 30;
export const MAX_BPM = 250;
export const clampBpm = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

interface Settings { sound: boolean; volume: number }
const STORAGE_KEY = 'cv_metronome';
const DEFAULTS: Settings = { sound: true, volume: 0.7 };

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound, volume: typeof saved.volume === 'number' ? saved.volume : DEFAULTS.volume };
  } catch { return DEFAULTS; }
}

type AudioCtx = typeof AudioContext;
const audioContextClass = (): AudioCtx | null =>
  (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtx }).webkitAudioContext)) || null;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;

/**
 * A metronome on the Web Audio clock: notes are scheduled slightly ahead so timing stays steady
 * even when the page is busy. Tempo and beats per bar come from the song (or its setlist entry);
 * only sound and volume are personal settings. `beat` (0-based, -1 when stopped) drives the light.
 */
export function useMetronome(songBpm: number | null | undefined, beatsPerBar: number | null | undefined = 4) {
  const beats = beatsPerBar && beatsPerBar > 1 ? beatsPerBar : 4;
  const [bpm, setBpmState] = useState(() => clampBpm(songBpm || 80));
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const nextTimeRef = useRef(0);
  const beatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const settingsRef = useRef(settings);
  const beatsRef = useRef(beats);
  useEffect(() => { beatsRef.current = beats; }, [beats]);
  const visualTimers = useRef<number[]>([]);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => {
    settingsRef.current = settings;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }, [settings]);

  const click = useCallback((ctx: AudioContext, time: number, accent: boolean) => {
    const { sound, volume } = settingsRef.current;
    if (!sound || volume <= 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== undefined) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    visualTimers.current.forEach(t => window.clearTimeout(t));
    visualTimers.current = [];
    setRunning(false);
    setBeat(-1);
  }, []);

  const start = useCallback(() => {
    const Ctx = audioContextClass();
    if (!Ctx) return;
    // Created on a tap, as phones require before they play sound.
    const ctx = ctxRef.current ?? new Ctx();
    ctxRef.current = ctx;
    void ctx.resume?.();
    beatRef.current = 0;
    nextTimeRef.current = ctx.currentTime + 0.06;
    const schedule = () => {
      while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
        const n = beatRef.current;
        const at = nextTimeRef.current;
        click(ctx, at, n === 0);
        const delay = Math.max(0, (at - ctx.currentTime) * 1000);
        visualTimers.current.push(window.setTimeout(() => setBeat(n), delay));
        if (visualTimers.current.length > 32) visualTimers.current.splice(0, 16);
        nextTimeRef.current += 60 / bpmRef.current;
        beatRef.current = (n + 1) % beatsRef.current;
      }
    };
    schedule();
    timerRef.current = window.setInterval(schedule, LOOKAHEAD_MS);
    setRunning(true);
  }, [click]);

  const toggle = useCallback(() => (running ? stop() : start()), [running, start, stop]);
  const update = useCallback((patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch })), []);

  // A new song brings its own tempo; stop so a wrong tempo never carries over.
  useEffect(() => {
    stop();
    setBpmState(clampBpm(songBpm || 80));
  }, [songBpm, beats, stop]);

  useEffect(() => () => {
    stop();
    void ctxRef.current?.close?.().catch(() => {});
  }, [stop]);

  return {
    bpm, running, beat, hasTempo: !!songBpm,
    beatsPerBar: beats, sound: settings.sound, volume: settings.volume,
    supported: !!audioContextClass(),
    start, stop, toggle,
    setSound: (on: boolean) => update({ sound: on }),
    setVolume: (v: number) => update({ volume: v }),
  };
}

export type Metronome = ReturnType<typeof useMetronome>;
