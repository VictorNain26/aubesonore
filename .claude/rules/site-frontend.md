---
description: Frontend design system — loaded when opening a file under site/apps/frontend/
paths:
  - "site/apps/frontend/**"
---

# site frontend — design system

Paths below are relative to `site/apps/frontend/`.

## Where code lives (`src/`)

- One folder per feature, its views, stores and helpers together. Code moves to `shell/`, `design/`, `stores/`, `hooks/` or `lib/` only when several features share it; a store one feature alone reads stays in it.

## Tailwind v4 syntax only

- No `tailwind.config.js`, no `@tailwind base/components/utilities`, no `theme.extend`.
- Tokens live in `src/design/tokens.css` (`@theme inline`). New utilities via `@utility`, new variants via `@custom-variant`, in that file only.
- One style only: no dark theme, no `dark:` variant, no palette that changes with the time of day.

## Tokens

- Colors, text sizes and radii come only from the tokens of `src/design/tokens.css`. No hex/hsl/oklch value outside that file, no arbitrary value for color, spacing or typography (`bg-[#fff]`, `p-[13px]`, `text-[17px]`).
- The apricot `dawn` light is decoration only, never under text.
- Fonts are self-hosted with Fontsource: the CSP allows `font-src 'self'` only.
- A new text size goes in `tokens.css` and in the `extendTailwindMerge` list of `src/lib/utils.ts`, or `cn()` drops it next to a text color.
- A new color token gets its pair in `scripts/check-contrast.mjs`, and the script passes (wired in CI Quality).

## Non-negotiables

- Every interactive element: hover, focus-visible, active, disabled states; touch target ≥ 44px.
- Decorative motion only under `prefers-reduced-motion: no-preference` (`motion-safe:` or the `reveal` utility), never a shift that opens gaps between rows. CSS only, no animation library.
- Never ship UI blind: a UI PR is tried in Chrome at 1280 and 390 px wide before its merge (`.claude/rules/site.md`, Workflow rules).
- The home page is pre-rendered in French (`/`) and English (`/en/`) and hydrated: no browser API (`window`, `document`, `navigator`, `localStorage`, `Audio`) at module import or during render, only in effects and handlers. `src/entry-server.test.tsx` renders the app without a window and fails otherwise.
- Locale comes from the URL (Paraglide `url` strategy); `useLocaleStore.setLocale` swaps the URL without reloading so the stream keeps playing. A language switch is a navigation (`useSwitchLocale`), so the page's data loads again.
- Store-coupled components ship a presentational unit (props in) + a thin store container, so the unit is testable without stores.
- Routing is React Router's data mode (`src/routes.tsx`): a page's data comes from its route's `loader`, read with `useLoaderData`, never fetched in an effect. The server renders with `hydrate={false}` (no inline script, CSP) and runs no loader; `main.tsx` hydrates from the data it was given.
