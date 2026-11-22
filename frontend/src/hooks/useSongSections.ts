import { useCallback, useEffect, useRef, useState } from 'react';

export interface SongSection {
  index: number;
  label: string;
}

/** Distance from the top of the window that counts as "you are reading this section". */
const READ_LINE = 0.3;
const JUMP_GAP = 12;

function labelEls(): HTMLElement[] {
  const out = document.getElementById('chord-output');
  return out ? Array.from(out.querySelectorAll<HTMLElement>('h3.label')) : [];
}

/**
 * Finds the section labels (Verse 1, Chorus, Bridge...) in the rendered chord sheet,
 * tracks which one is being read, and scrolls to one on request.
 */
export function useSongSections(html: string) {
  const [found, setFound] = useState<{ html: string; sections: SongSection[] }>({ html: '', sections: [] });
  const sections = found.sections;
  const [active, setActive] = useState(-1);
  // After a tap, keep that button lit until the reader scrolls by hand (the last
  // sections often cannot reach the read line because the page ends).
  const pinned = useRef<number | null>(null);

  useEffect(() => {
    const found = labelEls().map((el, index) => ({ index, label: (el.textContent || '').trim() }));
    setFound({ html, sections: found });
    pinned.current = null;
    setActive(found.length ? 0 : -1);
  }, [html]);

  useEffect(() => {
    if (!sections.length) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (pinned.current !== null) return;
      const line = window.innerHeight * READ_LINE;
      const els = labelEls();
      let current = 0;
      els.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) current = i; });
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const unpin = () => { pinned.current = null; };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('touchstart', unpin, { passive: true });
    window.addEventListener('wheel', unpin, { passive: true });
    window.addEventListener('keydown', unpin);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('touchstart', unpin);
      window.removeEventListener('wheel', unpin);
      window.removeEventListener('keydown', unpin);
    };
  }, [sections]);

  const jumpTo = useCallback((index: number) => {
    const el = labelEls()[index];
    if (!el) return;
    pinned.current = index;
    setActive(index);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const top = el.getBoundingClientRect().top + window.scrollY - JUMP_GAP;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
    // Briefly mark the section on the sheet so the eye finds it.
    const para = el.closest<HTMLElement>('.paragraph') ?? el;
    para.classList.remove('section-flash');
    void para.offsetWidth;
    para.classList.add('section-flash');
    window.setTimeout(() => para.classList.remove('section-flash'), 1200);
  }, []);

  /** forHtml: the sheet these sections were read from, so callers can tell a fresh list from a stale one. */
  return { sections, active, jumpTo, forHtml: found.html };
}
