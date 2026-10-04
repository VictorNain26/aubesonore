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

/** Static 404, pre-rendered once for both languages (nginx serves it for any unknown path). */
export function NotFoundPage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden="true" className="dawn-band dawn-arrive" />
      <div className="lift-in px-page relative z-10 flex flex-1 flex-col justify-center gap-5">
        <p className="text-label text-text-muted m-0 font-mono uppercase">404 — hors antenne</p>
        <h1 className="text-hero m-0">Un blanc à l&apos;antenne.</h1>
        <p className="text-intro text-text-muted max-w-blurb m-0">
          Cette page n&apos;existe pas, ou plus. La musique, elle, ne s&apos;est pas arrêtée.
        </p>
        <p className="m-0 mt-3">
          <a
            href="/"
            className="bg-accent text-on-accent text-ui ease-out-quart focus-visible:outline-accent inline-flex h-12 items-center rounded-full px-6 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
          >
            Revenir au direct
          </a>
        </p>
        <p lang="en" className="text-ui text-text-muted m-0 mt-4">
          Dead air: this page does not exist, or no longer does.{' '}
          <a
            href="/en/"
            className="text-text underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            Back to the radio
          </a>
        </p>
      </div>
      <div className="px-page relative z-10 h-36 md:h-50">
        <svg
          aria-hidden="true"
          viewBox="0 0 1000 80"
          preserveAspectRatio="none"
          className="draw-in absolute inset-x-0 bottom-0 h-20 w-full mask-r-from-90% md:h-30"
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
        <div className="relative size-full">
          <p className="text-logo condensed absolute bottom-10 left-0 m-0 md:bottom-15">
            aubesonore
          </p>
        </div>
      </div>
    </main>
  );
}
