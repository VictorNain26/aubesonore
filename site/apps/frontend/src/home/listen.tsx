import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';

export type ListenState = 'idle' | 'connecting' | 'playing';

export function listenState(isPlaying: boolean, isConnecting: boolean): ListenState {
  if (isConnecting) return 'connecting';
  return isPlaying ? 'playing' : 'idle';
}

/**
 * The action the button does now: from the click on it stops the live (the player has no pause:
 * a press after rejoins the live where it is), the ring tells the waiting.
 */
export function listenLabel(state: ListenState): string {
  return state === 'idle' ? m.player_listen() : m.player_stop();
}

export function listenAria(state: ListenState): string {
  return state === 'idle' ? m.player_listen_aria() : m.player_stop_aria();
}

// A third of the disc: 16 px in the phone bar's, about 15 in the hero's.
const GLYPH =
  'ease-out-quart absolute inset-0 m-auto size-1/3 transition-[opacity,scale] duration-200';
const SHOWN = 'scale-100 opacity-100';
const HIDDEN = 'scale-50 opacity-0';
// While the live plays, the bars give way to the stop glyph under the pointer or the focus:
// the button shows what is happening, then what a press does.
const ON_PRESS_HIDE =
  'group-hover:scale-50 group-hover:opacity-0 group-focus-visible:scale-50 group-focus-visible:opacity-0';
const ON_PRESS_SHOW =
  'group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100';

const TONE = {
  // On an accent ground (the phone's bar, the ink pill): the accent's own ink, whatever the ground.
  paper: { disc: 'bg-on-accent text-accent', ring: 'border-accent/15 border-t-accent' },
  // In the bar's paper pill: the bar's colour.
  ink: { disc: 'bg-accent text-on-accent', ring: 'border-on-accent/15 border-t-on-accent' },
};

/**
 * The disc of Écouter, paper on the phone's bar and in the ink pill, ink in the bar's paper pill, with
 * the play glyph; three live bars while the stream plays, the stop square when the pointer or the
 * focus is on its button (which carries `group`); a thin ring turns while the stream connects. The
 * glyphs cross-fade instead of swapping.
 */
export function ListenDisc({
  state,
  tone = 'paper',
  className,
}: {
  state: ListenState;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full',
        TONE[tone].disc,
        className
      )}
    >
      {state === 'connecting' ? (
        <span
          className={cn(
            'absolute inset-1 rounded-full border-2 motion-safe:animate-spin',
            TONE[tone].ring
          )}
        />
      ) : null}
      <svg viewBox="0 0 20 20" className={cn(GLYPH, state === 'idle' ? SHOWN : HIDDEN)}>
        <path
          d="M6 3.5v13a.6.6 0 0 0 .9.5l10.4-6.5a.6.6 0 0 0 0-1L6.9 3a.6.6 0 0 0-.9.5Z"
          fill="currentColor"
        />
      </svg>
      <span
        className={cn(
          GLYPH,
          'live-bars flex items-end justify-center gap-0.5 py-0.5',
          state === 'playing' ? cn(SHOWN, ON_PRESS_HIDE) : HIDDEN
        )}
      >
        <span className="h-full w-1 rounded-full bg-current" />
        <span className="h-full w-1 rounded-full bg-current" />
        <span className="h-full w-1 rounded-full bg-current" />
      </span>
      <svg
        viewBox="0 0 20 20"
        className={cn(
          GLYPH,
          state === 'connecting' ? SHOWN : state === 'playing' ? cn(HIDDEN, ON_PRESS_SHOW) : HIDDEN
        )}
      >
        <rect x="4" y="4" width="12" height="12" rx="1.5" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Under the pointer the pill lifts 2 px on its shadow (the shadow alone under reduced motion). */
const PILL =
  'group ease-spring hover:shadow-cover flex items-center rounded-full transition-[translate,scale,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 motion-safe:hover:-translate-y-0.5';

const PLACE = {
  // On the paper (the hero, the phone's sheet): the ink pill, its paper disc.
  page: {
    pill: 'bg-accent text-on-accent focus-visible:outline-accent h-14 gap-3 py-1.5 pr-6 pl-1.5',
    disc: 'paper',
    discSize: 'size-11',
  },
  // On the ink bar, the other way round: the paper pill, its ink disc, a step smaller.
  bar: {
    pill: 'bg-on-accent text-accent focus-visible:outline-on-accent h-12 gap-2.5 py-1 pr-5.5 pl-1',
    disc: 'ink',
    discSize: 'size-10',
  },
} as const;

/**
 * Écouter, its disc and its word: « Écouter », « Arrêter » while the live plays. The hero's and the
 * phone's sheet's on the paper, the player bar's on a computer.
 */
export function ListenPill({
  listen,
  onToggle,
  place = 'page',
  className,
}: {
  listen: ListenState;
  onToggle: () => void;
  place?: keyof typeof PLACE;
  className?: string;
}) {
  const look = PLACE[place];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={listenAria(listen)}
      aria-busy={listen === 'connecting'}
      className={cn(PILL, look.pill, className)}
    >
      <ListenDisc state={listen} tone={look.disc} className={look.discSize} />
      <span className="text-ui font-semibold">{listenLabel(listen)}</span>
    </button>
  );
}
