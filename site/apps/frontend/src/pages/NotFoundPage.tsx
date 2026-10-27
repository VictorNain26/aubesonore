import { usePageTitle } from '../hooks/usePageTitle';
import * as m from '@/paraglide/messages.js';
import { SiteHeader } from '../shell/SiteHeader';
import { SiteFooter } from '../shell/SiteFooter';
import { PageMessage } from '../shell/PageMessage';
import { Wave } from '../design/Wave';

const SILENCE_FROM = 0.54;
const SILENCE_TO = 0.8;
const FADE = 0.06;

/** The line, full at its ends, falls silent between SILENCE_FROM and SILENCE_TO: dead air. */
function silence(t: number): number {
  const ramp = (x: number) => Math.min(1, Math.max(0, x / FADE));
  return ramp(SILENCE_FROM - t) + ramp(t - SILENCE_TO);
}

/**
 * The 404, in the URL's language: nginx serves it pre-rendered for any unknown path (in English
 * under /en/), and the client hydrates it there. The horizon falls silent in its middle.
 */
export function NotFoundPage() {
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
          <Wave
            height={80}
            amplitude={12}
            envelope={silence}
            className="draw-in absolute inset-x-0 bottom-10 h-20 w-full mask-r-from-90% md:bottom-15 md:h-30"
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
