/** Text button of the v4 home (Garder, Partager, Plus tôt dans la journée…): no box, 44px target. */
export const TEXT_ACTION =
  'text-body ease-out-quart focus-visible:outline-accent inline-flex min-h-11 items-center gap-2 transition-[opacity,scale] duration-150 hover:opacity-70 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50';

/** Garder beside Écouter: the heart in a ring as tall as the pill (the hero, the phone's sheet). */
export const KEEP_RING =
  'group ease-out-quart focus-visible:outline-accent border-border hover:bg-surface-raised flex size-13 shrink-0 items-center justify-center rounded-full border transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90 disabled:opacity-50';

/** An artist's name that leads to their page: underlined, since a phone has no hover. */
export const ARTIST_LINK =
  'ease-out-quart hover:text-text focus-visible:outline-accent decoration-text-muted/40 hover:decoration-text underline decoration-1 transition-[color,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70';

/** The ink pill back to the live, where a page has nothing to show (404, an unknown artist). */
export const BACK_TO_LIVE =
  'bg-accent text-on-accent text-body ease-spring focus-visible:outline-accent inline-flex h-14 items-center rounded-full px-6 font-semibold transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95';

/** A square 44px close button, for a full-screen menu, a sheet or a large image. */
export const CLOSE_BUTTON =
  'ease-out-quart hover:bg-surface-raised focus-visible:outline-accent inline-flex size-11 shrink-0 items-center justify-center transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90';

/** An outlined action at a right angle (Se connecter, Menu): it fills with ink under the pointer. */
export const OUTLINE_ACTION =
  'text-body border-accent ease-out-quart hover:bg-accent hover:text-on-accent focus-visible:outline-accent inline-flex min-h-11 items-center border px-4.5 transition-[color,background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-97';

/** A link stretched over its whole row (its ::after covers the row, which is `relative`). */
export const STRETCHED = "after:absolute after:inset-0 after:content-['']";
