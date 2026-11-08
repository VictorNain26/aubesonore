---
paths:
  - "site/apps/frontend/**"
---

# site frontend

Paths below are relative to `site/apps/frontend/`.

## Structure

One folder per feature, its views, stores and helpers together. Code moves to `shell/`, `design/`,
`stores/`, `hooks/` or `lib/` once several features share it.

## Tailwind v4 and tokens

- Tailwind v4 syntax: tokens are in `src/design/tokens.css` (`@theme inline`), new utilities via
  `@utility` and new variants via `@custom-variant`, in that file. No `tailwind.config.js` or
  `@tailwind` directives.
- Colors, text sizes and radii come from those tokens rather than arbitrary values (`bg-[#fff]`,
  `p-[13px]`, `text-[17px]`).
- A token that changes by night is written once, on the day and night switch of `tokens.css`
  (`--by-day`, `--by-night`), not as a second palette or a `dark:` variant. Code that draws with a
  token follows the night through `onColorSchemeChange` (`src/stores/themeStore.ts`), since the night
  can be the listener's choice as well as the device's.
- The apricot `dawn` light is decoration only, not under text.
- A new text size goes in `tokens.css` and in the `extendTailwindMerge` list of `src/lib/utils.ts`,
  or `cn()` drops it next to a text color.
- A new color token gets its pair in `scripts/check-contrast.mjs`, and the script passes by day and
  by night.

## Components

- Every interactive element has hover, focus-visible, active and disabled states and a touch target
  of at least 44px.
- Decorative motion runs under `prefers-reduced-motion: no-preference` (`motion-safe:` or the `reveal`
  utility), and doesn't shift rows apart.
- The home page is pre-rendered (`/`, `/en/`) and hydrated, so browser APIs (`window`, `document`,
  `navigator`, `localStorage`, `Audio`) belong in effects and handlers, not at module import or during
  render. `src/entry-server.test.tsx` fails otherwise.
- A language switch is a navigation (`useSwitchLocale`), so the page's data loads again;
  `useLocaleStore.setLocale` swaps the URL without reloading so the stream keeps playing.
- Store-coupled components ship a presentational unit (props in) and a thin store container.
- Mockups are explored and validated on the site's single Claude Design canvas; a validated decision
  enters the code by a PR.
- A design change proves it changes nothing else: `test:visual` (README « Captures et
  accessibilité ») passes, and a new page or state gets its capture. Fix the element that is wrong
  rather than the shared utility or token every block uses.
- A page's data comes from its route's `loader` (`src/routes.tsx`), read with `useLoaderData`. The
  server renders with `hydrate={false}` (no inline script, CSP) and runs no loader; `main.tsx`
  hydrates from the data it was given.
