import { useEffect } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

const PREFIX = 'aubesonore:scroll:';

/**
 * Back and forward return the reader to where they were on a page, once it
 * is `ready`: the content arrives after the route changes, so the browser's
 * own restoration would land on a page still too short. A new page opens at
 * the top. React Router's ScrollRestoration needs its data mode, which this
 * site does not use (reactrouter.com/api/components/ScrollRestoration).
 */
export function useScrollMemory(ready: boolean) {
  const { key } = useLocation();
  const navigation = useNavigationType();

  useEffect(() => {
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The page that follows a link can be shorter while it loads, and
        // the scroll it clamps belongs to it, not to this entry.
        if ((history.state as { key?: string } | null)?.key !== key) return;
        try {
          sessionStorage.setItem(PREFIX + key, String(Math.round(window.scrollY)));
        } catch {
          // Storage refused: back opens at the top.
        }
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.removeEventListener('scroll', save);
      cancelAnimationFrame(frame);
    };
  }, [key]);

  useEffect(() => {
    if (navigation !== NavigationType.Pop) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [key, navigation]);

  useEffect(() => {
    if (!ready || navigation !== NavigationType.Pop) return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(PREFIX + key);
    } catch {
      return;
    }
    if (saved !== null) window.scrollTo({ top: Number(saved), behavior: 'instant' });
  }, [ready, key, navigation]);
}
