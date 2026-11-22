import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface LiveState {
  active: boolean;
  index: number;
  /** Section number within the song, or -1 for the top of the song. */
  section: number;
  leader: string | null;
  seq: number;
  listeners: number;
}

export type LiveStatus = 'off' | 'connecting' | 'connected' | 'unavailable';

interface Options {
  setlistId: number | string;
  /** False for browser-only setlists, private setlists, or while offline. */
  enabled: boolean;
  token?: string | null;
}

/**
 * Listens to a setlist's live session and lets a leader drive it.
 * Followers need no login; the server only allows public setlists.
 */
export function useLiveSession({ setlistId, enabled, token }: Options) {
  const [remote, setRemote] = useState<LiveState | null>(null);
  const [status, setStatus] = useState<LiveStatus>('off');
  const [leading, setLeadingState] = useState(false);
  const [following, setFollowing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ index: number; section: number } | null>(null);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') { setStatus('off'); setRemote(null); return; }
    setStatus('connecting');
    const es = new EventSource(`/api/live/${encodeURIComponent(String(setlistId))}/stream`);
    es.onopen = () => setStatus('connected');
    es.onmessage = (e) => {
      try { setRemote(JSON.parse(e.data) as LiveState); setStatus('connected'); } catch { /* ignore malformed */ }
    };
    // EventSource retries on its own; CLOSED means the server refused (e.g. not public).
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'unavailable' : 'connecting');
    return () => es.close();
  }, [setlistId, enabled]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api('POST', `/api/live/${encodeURIComponent(String(setlistId))}`, body, token);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server');
      return false;
    }
  }, [setlistId, token]);

  /** Leader only: tell everyone where we are. Repeats of the same spot are skipped. */
  const publish = useCallback((index: number, section: number) => {
    if (!leading) return;
    if (last.current && last.current.index === index && last.current.section === section) return;
    last.current = { index, section };
    void post({ index, section });
  }, [leading, post]);

  const startLeading = useCallback(async (index: number, section: number) => {
    last.current = { index, section };
    if (await post({ index, section })) setLeadingState(true);
  }, [post]);

  const stopLeading = useCallback(async () => {
    setLeadingState(false);
    last.current = null;
    await post({ active: false });
  }, [post]);

  // Leaving the page while leading ends the session for everyone.
  const leadingRef = useRef(leading);
  useEffect(() => { leadingRef.current = leading; }, [leading]);
  useEffect(() => () => {
    if (leadingRef.current) void api('POST', `/api/live/${encodeURIComponent(String(setlistId))}`, { active: false }, token).catch(() => {});
  }, [setlistId, token]);

  return { remote, status, leading, following, setFollowing, startLeading, stopLeading, publish, error };
}
