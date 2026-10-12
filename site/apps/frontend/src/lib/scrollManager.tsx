import { useEffect, useLayoutEffect } from 'react';
import { NavigationType, useLocation, useNavigationType, type Location } from 'react-router';

const PREFIX = 'aubesonore:scroll:';
// Past this, the page that came back is as tall as it will get: the reader is put as near as it
// allows.
const RESTORE_WITHIN_MS = 3_000;

function read(key: string): number | null {
  try {
    const saved = sessionStorage.getItem(PREFIX + key);
    return saved === null ? null : Number(saved);
  } catch {
    return null;
  }
}

function write(key: string, top: number): void {
  try {
    sessionStorage.setItem(PREFIX + key, String(Math.round(top)));
  } catch {
    // Storage refused: back opens at the top.
  }
}

// The first entry is read once: a reload opens at the top, as under a hero that renders after
// it mid-page would be lost. Read in the effect, never at import (entry-server.test.tsx).
let firstEntrySeen = false;

function isReload(): boolean {
  const entry = performance.getEntriesByType('navigation')[0] as { type?: string } | undefined;
  return entry?.type === 'reload';
}

function anchorOf(location: Location): HTMLElement | null {
  return location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
}

/**
 * Waits for the page to allow `arrive` (content comes after the route changes), then calls
 * it, at the latest after RESTORE_WITHIN_MS. The reader's own scroll, meanwhile, wins.
 */
function whenReady(allows: () => boolean, arrive: () => void): () => void {
  if (allows()) {
    arrive();
    return () => undefined;
  }
  // A notice already queued when the wait ends must not act after it.
  let waiting = true;
  const observer = new ResizeObserver(() => {
    if (waiting && allows()) finish(arrive);
  });
  const timer = setTimeout(() => finish(arrive), RESTORE_WITHIN_MS);
  const gestures = ['wheel', 'touchstart', 'keydown'] as const;
  const yield_ = () => finish();
  function finish(then?: () => void) {
    waiting = false;
    observer.disconnect();
    clearTimeout(timer);
    for (const gesture of gestures) window.removeEventListener(gesture, yield_);
    then?.();
  }
  observer.observe(document.body);
  for (const gesture of gestures) window.addEventListener(gesture, yield_, { passive: true });
  return () => finish();
}

/**
 * One scroll for every page of the site (docs: reactrouter.com, ScrollRestoration, needs the
 * data mode this site does not use, and knows nothing of content that comes after the route):
 * a new page opens at the top, or at the anchor its link names; back and forward put the reader
 * where they were once the page is tall enough again; a reload opens at the top. The browser's
 * own restoration is off (main.tsx): it would land on a page still too short.
 */
export function ScrollManager(): null {
  const location = useLocation();
  const navigation = useNavigationType();
  const { key } = location;

  useEffect(() => {
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The page that follows a link can be shorter while it loads, and the scroll it clamps
        // belongs to it, not to this entry. The first entry has no state: React Router keys it
        // "default" (its createBrowserHistory: `state && state.key || "default"`).
        if (((history.state as { key?: string } | null)?.key || 'default') !== key) return;
        write(key, window.scrollY);
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.removeEventListener('scroll', save);
      cancelAnimationFrame(frame);
    };
  }, [key]);

  // The location object changes with each entry only, as does the way it was reached.
  useLayoutEffect(() => {
    const first = !firstEntrySeen;
    firstEntrySeen = true;
    if (first && isReload()) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    if (navigation !== NavigationType.Pop) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (!location.hash) return;
      return whenReady(
        () => anchorOf(location) !== null,
        () => anchorOf(location)?.scrollIntoView()
      );
    }
    const saved = read(location.key);
    if (saved === null) return;
    const scrollable = () => document.documentElement.scrollHeight - window.innerHeight;
    return whenReady(
      () => scrollable() >= saved,
      () => window.scrollTo({ top: Math.min(saved, scrollable()), behavior: 'instant' })
    );
  }, [location, navigation]);

  return null;
}
