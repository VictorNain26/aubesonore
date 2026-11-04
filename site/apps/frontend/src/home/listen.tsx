import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';
import { Wave } from '../design/Wave';

export type ListenState = 'idle' | 'connecting' | 'playing';

const STATES: readonly ListenState[] = ['idle', 'connecting', 'playing'];

export function listenState(isPlaying: boolean, isConnecting: boolean): ListenState {
  if (isConnecting) return 'connecting';
  return isPlaying ? 'playing' : 'idle';
}

/**
 * What the button says: the action a press does at rest and while the live plays (the player has
 * no pause: a press after rejoins the live where it is), and « Connexion… » while the stream
 * connects or reconnects, when a press still stops it. Its name is its word (WCAG 2.5.3).
 */
export function listenLabel(state: ListenState): string {
  if (state === 'connecting') return m.player_connecting();
  return state === 'idle' ? m.player_listen() : m.player_stop();
}

export function listenAria(state: ListenState): string {
  if (state === 'connecting') return m.player_connecting();
  return state === 'idle' ? m.player_listen_aria() : m.player_stop_aria();
}

// A third of the disc: 16 px in the phone bar's, about 15 in the hero's.
const PLACED = 'ease-out-quart absolute inset-0 m-auto transition-[opacity,scale] duration-200';
const GLYPH = cn(PLACED, 'size-1/3');
const SHOWN = 'scale-100 opacity-100';
const HIDDEN = 'scale-50 opacity-0';

const TONE = {
  // On an accent ground (the phone's bar, the ink pill): the accent's own ink, whatever the ground.
  paper: 'bg-on-accent text-accent',
  // In the bar's paper pill: the bar's colour.
  ink: 'bg-accent text-on-accent',
};

/**
 * The disc of Écouter, paper on the phone's bar and in the ink pill, ink in the bar's paper pill:
 * the play glyph at rest, the stop square as soon as the live plays (nothing waits for a hover a
 * finger cannot give), and a short segment travelling along the line while the stream connects
 * (the loader's, design/LineLoader.tsx). The glyphs cross-fade instead of swapping.
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
        TONE[tone],
        className
      )}
    >
      <svg
        data-testid="glyph-play"
        viewBox="0 0 20 20"
        className={cn(GLYPH, state === 'idle' ? SHOWN : HIDDEN)}
      >
        <path
          d="M6 3.5v13a.6.6 0 0 0 .9.5l10.4-6.5a.6.6 0 0 0 0-1L6.9 3a.6.6 0 0 0-.9.5Z"
          fill="currentColor"
        />
      </svg>
      <Wave
        width={28}
        height={16}
        amplitude={4}
        seed={1.7}
        travel
        className={cn(PLACED, 'h-1/3 w-3/5', state === 'connecting' ? SHOWN : HIDDEN)}
      />
      <svg
        data-testid="glyph-stop"
        viewBox="0 0 20 20"
        className={cn(GLYPH, state === 'playing' ? SHOWN : HIDDEN)}
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
 * Écouter, its disc and its word: « Écouter », « Connexion… » while the stream connects, « Arrêter »
 * while the live plays. The hero's and the
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
  const others = STATES.filter((state) => state !== listen).map(listenLabel);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={listenAria(listen)}
      aria-busy={listen === 'connecting'}
      className={cn(PILL, look.pill, className)}
    >
      <ListenDisc state={listen} tone={look.disc} className={look.discSize} />
      {/* The pill as wide as its widest word: the two others sit, unseen, in the same cell (as
          ::before and ::after, so the button says only its own word), and it never grows nor
          pushes the heart when « Connexion… » comes. */}
      <span
        data-other={others[0]}
        data-another={others[1]}
        className={cn(
          'text-body grid font-semibold',
          '*:col-start-1 *:row-start-1',
          'before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-other)]',
          'after:invisible after:col-start-1 after:row-start-1 after:content-[attr(data-another)]'
        )}
      >
        <span>{listenLabel(listen)}</span>
      </span>
    </button>
  );
}
