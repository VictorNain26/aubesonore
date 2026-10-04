import { useEffect } from 'react';
import { Link } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';
import { SiteHeader } from '../home/SiteHeader';
import { SiteFooter } from '../home/SiteFooter';

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
  // Reached inside the app, the tab says where the listener is; pre-rendered, the head already does.
  useEffect(() => {
    document.title = `${m.notfound_meta_title()} · AubeSonore`;
  }, []);
  return (
    <>
      <main id="main" className="relative flex min-h-dvh flex-col overflow-hidden">
        <div aria-hidden="true" className="dawn-band dawn-arrive" />
        <SiteHeader />
        <div className="lift-in px-page relative z-10 flex flex-1 flex-col justify-center gap-3 py-16">
          <h1 className="text-hero m-0">{m.notfound_title()}</h1>
          <p className="text-intro text-text-muted max-w-blurb m-0">{m.notfound_body()}</p>
          <p className="m-0 mt-6">
            <Link
              to={localizeHref('/')}
              className="bg-accent text-on-accent text-ui ease-spring focus-visible:outline-accent inline-flex h-14 items-center rounded-full px-6 font-semibold transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              {m.artist_back()}
            </Link>
          </p>
        </div>
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
    </>
  );
}
