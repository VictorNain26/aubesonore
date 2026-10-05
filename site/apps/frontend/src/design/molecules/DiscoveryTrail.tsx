import { Link } from 'react-router';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { ARTIST_LINK } from '../../home/styles';
import { DISCOVERY, type TrailStep } from '../../lib/discoveryTrail';

/**
 * The artists walked through to reach this one, each a way back: « Stereolab › McCarthy ›
 * Tim Gane ». Shown from the second step on; the last is the page itself.
 */
export function DiscoveryTrail({ steps }: { steps: readonly TrailStep[] }) {
  if (steps.length < 2) return null;
  return (
    <nav aria-label={m.trail_label()}>
      <ol className="text-ui text-text-muted m-0 flex list-none flex-wrap items-center gap-x-2 p-0">
        {steps.map((step, i) => (
          <li key={step.path} className="inline-flex min-h-11 items-center gap-2">
            {i > 0 ? <span aria-hidden="true">›</span> : null}
            {i === steps.length - 1 ? (
              <span aria-current="page" className="text-text">
                {step.name}
              </span>
            ) : (
              <Link
                to={step.path}
                state={DISCOVERY}
                className={cn(ARTIST_LINK, 'underline-offset-4')}
              >
                {step.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
