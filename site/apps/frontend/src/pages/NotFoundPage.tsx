import { useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import * as m from '@/paraglide/messages.js';
import { SiteHeader } from '../shell/SiteHeader';
import { SiteFooter } from '../shell/SiteFooter';
import { useHeroListenVisible } from '../home/listen';
import { PageMessage } from '../shell/PageMessage';

const SILENCE_FROM = 0.54;
const SILENCE_TO = 0.8;
const FADE = 0.06;

function envelope(t: number): number {
  const ramp = (x: number) => Math.min(1, Math.max(0, x / FADE));
  return ramp(SILENCE_FROM - t) + ramp(t - SILENCE_TO);
}

/** The home page's horizon line, fallen silent in its middle: dead air. */
function silentHorizonPath(): string {
  const points = 240;
  let d = '';
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const wave =
      9 * Math.sin(t * 2 * Math.PI * 6) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 1.7 + 1)) +
      3 * Math.sin(t * 2 * Math.PI * 15 + 0.7);
    d += `${i === 0 ? 'M' : 'L'}${(t * 1000).toFixed(1)} ${(40 + envelope(t) * wave).toFixed(2)}`;
  }
  return d;
}

/**
 * The 404, in the URL's language: nginx serves it pre-rendered for any unknown path (in English
 * under /en/), and the client hydrates it there. The horizon falls silent in its middle.
 */
export function NotFoundPage() {
  const setListenVisible = useHeroListenVisible((s) => s.setVisible);

  // No hero here: the player bar is the only way to listen.
  useEffect(() => setListenVisible(false), [setListenVisible]);

  // Reached inside the app, the tab says where the listener is; pre-rendered, the head already does.
  usePageTitle(m.notfound_meta_title());
  return (
    <div className="min-h-page flex flex-col">
      <main id="main" className="relative flex flex-1 flex-col overflow-hidden">
        <div aria-hidden="true" className="dawn-band dawn-arrive" />
        <SiteHeader />
        <PageMessage
          className="relative z-10"
          title={m.notfound_title()}
          body={m.notfound_body()}
        />
        <div className="relative z-10 h-36 md:h-48">
          <svg
            aria-hidden="true"
            viewBox="0 0 1000 80"
            preserveAspectRatio="none"
            className="draw-in absolute inset-x-0 bottom-10 h-20 w-full mask-r-from-90% md:bottom-15 md:h-30"
          >
            <path
              d={silentHorizonPath()}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.78}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
