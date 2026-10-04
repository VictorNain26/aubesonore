import { create } from 'zustand';
import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';

/** Whether the hero's Écouter button is on screen; the player bar shows only when it is not. */
export const useHeroListenVisible = create<{ visible: boolean; setVisible: (v: boolean) => void }>(
  (set) => ({ visible: true, setVisible: (visible) => set({ visible }) })
);

export type ListenState = 'idle' | 'connecting' | 'playing';

export function listenState(isPlaying: boolean, isConnecting: boolean): ListenState {
  if (isConnecting) return 'connecting';
  return isPlaying ? 'playing' : 'idle';
}

/** The action the button does now: from the click on it pauses, the ring tells the waiting. */
export function listenLabel(state: ListenState): string {
  return state === 'idle' ? m.player_listen() : m.player_listening();
}

/** Both words share one grid cell, so the button keeps the width of the longer one. */
export function ListenLabel({ state, className }: { state: ListenState; className?: string }) {
  const shown = listenLabel(state);
  return (
    <span className={cn('grid', className)}>
      {[m.player_listen(), m.player_listening()].map((word) => (
        <span
          key={word}
          aria-hidden={word !== shown || undefined}
          className={cn('col-start-1 row-start-1', word !== shown && 'invisible')}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

export function listenAria(state: ListenState): string {
  return state === 'idle' ? m.player_listen_aria() : m.player_pause_aria();
}

const GLYPH =
  'ease-out-quart absolute inset-0 m-auto size-4 transition-[opacity,scale] duration-200';
const SHOWN = 'scale-100 opacity-100';
const HIDDEN = 'scale-50 opacity-0';
// While the live plays, the bars give way to the pause glyph under the pointer or the focus:
// the button shows what is happening, then what a press does.
const ON_PRESS_HIDE =
  'group-hover:scale-50 group-hover:opacity-0 group-focus-visible:scale-50 group-focus-visible:opacity-0';
const ON_PRESS_SHOW =
  'group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100';

/**
 * Paper disc with the play glyph; three live bars while the stream plays, the pause glyph when the
 * pointer or the focus is on its button (which carries `group`); a thin ring turns while the
 * stream connects. The glyphs cross-fade instead of swapping.
 */
export function ListenDisc({ state, className }: { state: ListenState; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-surface text-text relative flex shrink-0 items-center justify-center rounded-full',
        className
      )}
    >
      {state === 'connecting' ? (
        <span className="border-accent/15 border-t-accent absolute inset-1 rounded-full border-2 motion-safe:animate-spin" />
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
        <rect x="4.5" y="3" width="3.6" height="14" rx="1" fill="currentColor" />
        <rect x="11.9" y="3" width="3.6" height="14" rx="1" fill="currentColor" />
      </svg>
    </span>
  );
}
