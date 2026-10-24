import { useMatches } from 'react-router';
import { create } from 'zustand';

/** What a route says of its page (routes.tsx, `handle`). */
export interface RouteHandle {
  /** The page opens on its own player (the home page's hero): the player bar stays away from it. */
  heroPlayer?: boolean;
}

/**
 * Whether the player at the top of the page is on screen. One player shows at a time: the bar
 * stays away while that one does (shell/PlayerBar.tsx). On screen until the page's observer says
 * otherwise (home/Hero.tsx), so the pre-rendered home page draws the bar away too, and back to on
 * screen when the hero leaves, for the next page that has one.
 */
export const useHeroPlayerStore = create<{
  inView: boolean;
  setInView: (inView: boolean) => void;
}>((set) => ({ inView: true, setInView: (inView) => set({ inView }) }));

/** True on a page whose route opens on its own player. */
export function useHasHeroPlayer(): boolean {
  return useMatches().some((match) => (match.handle as RouteHandle | undefined)?.heroPlayer);
}
