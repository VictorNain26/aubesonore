# Frontend — agent conventions (design system)

## Tailwind v4 — this project uses v4 syntax ONLY

- No `tailwind.config.js`, no `@tailwind base/components/utilities`, no `theme.extend`.
- Tokens live in `src/design/tokens.css` (`@theme inline`). New utilities via `@utility`, new variants via `@custom-variant`, in that file only.
- One style only: no dark theme, no `dark:` variant, no palette that changes with the time of day.

## Token vocabulary (the ONLY allowed colors)

`bg-surface`, `bg-surface-raised`, `text-text`, `text-text-muted`, `text-text-faint`,
`border-border`, `bg-accent`, `text-accent`, `text-on-accent`, `text-on-accent-muted`, utilities
`dawn-band` and `dawn-glow`. The apricot `dawn` light is decoration only, never under text.

- Never write hex/hsl/oklch values outside `src/design/tokens.css`.
- Never use arbitrary values for color, spacing, typography (`bg-[#fff]`, `p-[13px]`, `text-[17px]`).
- Typography: Bricolage Grotesque, plus Geist Mono (`font-mono`) for times and labels; both self-hosted with Fontsource (the CSP allows `font-src 'self'` only).
- Home sizes (v4): `text-hero`, `text-logo` (+ `condensed`), `text-section`, `text-headline`, `text-intro`, `text-row`, `text-sub`, `text-ui`, `text-label`. Modals still use `text-title`, `text-body`, `text-caption` until they are redrawn. A new size goes in `tokens.css` **and** in the `extendTailwindMerge` list of `src/lib/utils.ts`, or `cn()` drops it next to a text color.
- Radii: `rounded-sm`, `rounded-md`, `rounded-full` — nothing else.
- New token needed? Add it to `tokens.css`, add its pair to `scripts/check-contrast.mjs`, run the script.

## Non-negotiables

- `node scripts/check-contrast.mjs` passes (wired in CI Quality).
- Every interactive element: hover, focus-visible, active, disabled states; touch target ≥ 44px.
- Decorative motion only under `prefers-reduced-motion: no-preference` (`motion-safe:` or the `reveal` utility): the light breathes, the now dot pulses, blocks come into focus as they enter the screen (opacity and blur only, never a shift that opens gaps between rows); micro-interactions 150–300ms. CSS only, no animation library.
- Never ship UI blind: before a UI PR, screenshot the real page at 1280 and 390 px wide (headless Chromium `--screenshot`) and look at it.
- The home page is pre-rendered at build time in French (`/`) and English (`/en/`): `vite build`, then `vite build --ssr src/entry-server.tsx`, then `scripts/prerender.mjs`, and the client hydrates it. No browser API (`window`, `document`, `navigator`, `localStorage`, `Audio`) at module import or during render, only in effects and handlers; `src/entry-server.test.tsx` renders the app without a window and fails otherwise. Locale comes from the URL (Paraglide `url` strategy); `useLocaleStore.setLocale` swaps the URL without reloading so the stream keeps playing.
- Store-coupled components ship a presentational unit (props in) + a thin store container, so the unit is testable without stores.
