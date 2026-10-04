import { create } from 'zustand';
import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';

/** Whether the hero's Écouter button is on screen; the player bar shows only when it is not. */
export const useHeroListenVisible = create<{ visible: boolean; setVisible: (v: boolean) => void }>(
  (set) => ({ visible: true, setVisible: (visible) => set({ visible }) })
);

/** The ink pill that starts the live: the page's main action, one per screen. */
export const LISTEN_PILL =
  'group bg-accent text-on-accent ease-spring focus-visible:outline-accent flex h-14 w-full items-center gap-3 rounded-full py-1.5 pr-6 pl-1.5 transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 md:w-auto';

export type ListenState = 'idle' | 'connecting' | 'playing';

export function listenState(isPlaying: boolean, isConnecting: boolean): ListenState {
  if (isConnecting) return 'connecting';
  return isPlaying ? 'playing' : 'idle';
}

export function listenLabel(state: ListenState): string {
  if (state === 'connecting') return m.player_connecting();
  return state === 'playing' ? m.player_listening() : m.player_listen();
}

export function listenAria(state: ListenState): string {
  return state === 'idle' ? m.player_listen_aria() : m.player_pause_aria();
}

/** Paper disc with the play / pause glyph; a thin ring turns while the stream connects. */
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
      <svg viewBox="0 0 20 20" className="size-4">
        {state === 'idle' ? (
          <path
            d="M6 3.5v13a.6.6 0 0 0 .9.5l10.4-6.5a.6.6 0 0 0 0-1L6.9 3a.6.6 0 0 0-.9.5Z"
            fill="currentColor"
          />
        ) : (
          <>
            <rect x="4.5" y="3" width="3.6" height="14" rx="1" fill="currentColor" />
            <rect x="11.9" y="3" width="3.6" height="14" rx="1" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  );
}
