# Frontend — agent conventions (design system)

## Where code lives (`src/`)

- `pages/`: one file per route, named exports, loaded when opened (`routes.tsx`).
- One folder per feature, its views, stores and helpers together: `home/`, `artist/`, `musilogy/` (the artist page's sections, `ArtistSections`; the search, `SearchView`), `library/`, `auth/`.
- `shell/`: what every page shares, the header, the footer, the menu, the player bar, the layout, the page message, and the invisible hosts App mounts once (session, now playing, the player's side effects).
- `design/`: the shared visual primitives, one level (buttons, covers, sections, `classes.ts` for the class strings several components share), and the tokens.
- `stores/`: the stores several features read (auth, kept tracks, locale, casting); a store one feature alone reads stays in it.
- `hooks/`: hooks several features use; `lib/`: logic without UI (API, data loaders, config, time); `cast/`: the Cast receiver.

## Tailwind v4 — this project uses v4 syntax ONLY

- No `tailwind.config.js`, no `@tailwind base/components/utilities`, no `theme.extend`.
- Tokens live in `src/design/tokens.css` (`@theme inline`). New utilities via `@utility`, new variants via `@custom-variant`, in that file only.
- One style only: no dark theme, no `dark:` variant, no palette that changes with the time of day.

## Token vocabulary (the ONLY allowed colors)

`bg-surface`, `bg-surface-raised`, `text-text`, `text-text-muted`, `text-text-faint`,
`border-border`, `bg-accent`, `text-accent`, `text-on-accent`, `text-on-accent-muted`, utilities
`dawn-band`. The apricot `dawn` light is decoration only, never under text.

- Never write hex/hsl/oklch values outside `src/design/tokens.css`.
- Never use arbitrary values for color, spacing, typography (`bg-[#fff]`, `p-[13px]`, `text-[17px]`).
- Typography: Bricolage Grotesque, plus Geist Mono (`font-mono`) for times and labels; both self-hosted with Fontsource (the CSP allows `font-src 'self'` only).
- Sizes: `text-hero`, `text-mark` (the header's wordmark), `text-section`, `text-headline`, `text-intro`, `text-title`, `text-row`, `text-sub`, `text-body`, `text-ui`, `text-caption`, `text-label`. A new size goes in `tokens.css` **and** in the `extendTailwindMerge` list of `src/lib/utils.ts`, or `cn()` drops it next to a text color.
- Radii: `rounded-sm`, `rounded-md`, `rounded-full` — nothing else.
- New token needed? Add it to `tokens.css`, add its pair to `scripts/check-contrast.mjs`, run the script.

## Non-negotiables

- `node scripts/check-contrast.mjs` passes (wired in CI Quality).
- Every interactive element: hover, focus-visible, active, disabled states; touch target ≥ 44px.
- Decorative motion only under `prefers-reduced-motion: no-preference` (`motion-safe:` or the `reveal` utility): the light breathes, the now dot pulses, blocks come forward as they enter the screen (opacity and a 98% scale, never a shift that opens gaps between rows); micro-interactions 150–300ms. CSS only, no animation library.
- Never ship UI blind: before a UI PR, screenshot the real page at 1280 and 390 px wide (headless Chromium `--screenshot`) and look at it.
- The home page is pre-rendered at build time in French (`/`) and English (`/en/`): `vite build`, then `vite build --ssr src/entry-server.tsx`, then `scripts/prerender.mjs`, and the client hydrates it. No browser API (`window`, `document`, `navigator`, `localStorage`, `Audio`) at module import or during render, only in effects and handlers; `src/entry-server.test.tsx` renders the app without a window and fails otherwise. Locale comes from the URL (Paraglide `url` strategy); `useLocaleStore.setLocale` swaps the URL without reloading so the stream keeps playing.
- Store-coupled components ship a presentational unit (props in) + a thin store container, so the unit is testable without stores.
- Routing is React Router's data mode (`src/routes.tsx`, reactrouter.com/start/modes): a page's data comes from its route's `loader` (a client cache inside it, reactrouter.com/how-to/client-data), read with `useLoaderData`, never fetched in an effect; pages load their code when opened (`lazy`). `ScrollRestoration` (`App.tsx`) opens a new page at the top or at its anchor and puts the reader back on back and forward, once the loader has answered. The server renders through `createStaticHandler` with `hydrate={false}` (no inline script, CSP) and runs no loader (`dataStrategy` hands each page the data it is given); `main.tsx` hydrates from that data, the home page's lists asked once drawn (`useRevalidator`). A language switch is a navigation (`useSwitchLocale`), so the page's data loads again in it.
