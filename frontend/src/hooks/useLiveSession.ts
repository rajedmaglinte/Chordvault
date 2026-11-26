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
  /** False for browser-only setlists, private setlists, signed-out viewers, or while offline. */
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

  // Follow the session as a stream of Server-Sent Events. fetch (not EventSource) so the member's
  // sign-in goes in a header: setlists are for their church's members only.
  useEffect(() => {
    if (!enabled || !token || typeof fetch !== 'function') { setStatus('off'); setRemote(null); return; }
    const ctrl = new AbortController();
    let retry: number | undefined;
    const url = `/api/live/${encodeURIComponent(String(setlistId))}/stream`;
    const connect = async () => {
      setStatus('connecting');
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: ctrl.signal });
        if ([401, 403, 404].includes(res.status)) { setStatus('unavailable'); return; }
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        setStatus('connected');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let cut;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const event = buf.slice(0, cut);
            buf = buf.slice(cut + 2);
            const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            if (data) { try { setRemote(JSON.parse(data) as LiveState); } catch { /* ignore malformed */ } }
          }
        }
      } catch {
        if (ctrl.signal.aborted) return;
      }
      if (ctrl.signal.aborted) return;
      // Dropped (sleep, Wi-Fi change, server restart): try again shortly.
      setStatus('connecting');
      retry = window.setTimeout(() => { void connect(); }, 2000);
    };
    void connect();
    return () => { ctrl.abort(); if (retry) window.clearTimeout(retry); };
  }, [setlistId, enabled, token]);

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
