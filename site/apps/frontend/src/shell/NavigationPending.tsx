import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router';
import * as m from '@/paraglide/messages.js';
import { Wave } from '../design/Wave';

/** A page this tab already holds comes before this: it shows without the line flashing. */
const SHOW_AFTER_MS = 200;

/**
 * While the next page's data loads (its loader), the page left stays on screen: a short segment
 * travels along a line at the top, the site's loader (LineLoader), to say the click was heard.
 * React Router's global pending UI: `useNavigation().location` is set while a navigation is under
 * way (reactrouter.com/start/framework/pending-ui).
 */
export function NavigationPending() {
  const navigating = Boolean(useNavigation().location);
  const [late, setLate] = useState(false);

  useEffect(() => {
    if (!navigating) return;
    const timer = setTimeout(() => setLate(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [navigating]);

  if (!navigating || !late) return null;
  return (
    <div
      role="progressbar"
      aria-label={m.loading()}
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      <Wave height={8} amplitude={2} seed={1.7} travel className="text-text h-2 w-full" />
    </div>
  );
}
