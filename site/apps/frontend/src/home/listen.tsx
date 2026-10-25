import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';

/** The ink pill that starts the live in the phone's track sheet. */
export const LISTEN_PILL =
  'group bg-accent text-on-accent ease-spring focus-visible:outline-accent flex h-14 w-full items-center gap-3 rounded-full py-1.5 pr-6 pl-1.5 transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 md:w-auto';

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

// Two fifths of the disc: 22 px in the hero's 56, as the mockup draws it.
const GLYPH =
  'ease-out-quart absolute inset-0 m-auto size-2/5 transition-[opacity,scale] duration-200';
const SHOWN = 'scale-100 opacity-100';
const HIDDEN = 'scale-50 opacity-0';
// While the live plays, the bars give way to the stop glyph under the pointer or the focus:
// the button shows what is happening, then what a press does.
const ON_PRESS_HIDE =
  'group-hover:scale-50 group-hover:opacity-0 group-focus-visible:scale-50 group-focus-visible:opacity-0';
const ON_PRESS_SHOW =
  'group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100';

const TONE = {
  // On an accent ground (the bar, the sheet's pill): a disc of the accent's own ink, whatever the
  // ground, the glyphs drawn in the accent.
  paper: { disc: 'bg-on-accent text-accent', ring: 'border-accent/15 border-t-accent' },
  // On the paper (the hero): a circle drawn in the text's line, nothing filled.
  line: {
    disc: 'listen-line text-text ease-out-quart group-hover:bg-text/6 transition-colors duration-150',
    ring: 'border-text/15 border-t-text',
  },
};

/**
 * The disc of Écouter: a circle in a line on the hero's paper, filled with the accent's ink on the
 * bar and in the sheet's pill; the play glyph drawn in a line, three live bars while the stream
 * plays, the stop square when the pointer or the focus is on its button (which carries `group`);
 * a thin ring turns while the stream connects. The glyphs cross-fade instead of swapping.
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
          d="M7 5.2 L15.5 10 L7 14.8 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
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
        <rect
          x="5.5"
          y="5.5"
          width="9"
          height="9"
          rx="0.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
