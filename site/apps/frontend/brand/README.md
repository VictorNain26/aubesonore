# AubeSonore's mark

A horizon line that becomes a sound wave where the sun rises through it, beside the word
**aubesonore**. Every file of the mark is made by `build.py` from the rules below: change a rule,
run the script, never edit an output by hand.

```bash
cd site/apps/frontend
uv run brand/build.py                     # finds Playwright's Chromium in ~/.cache/ms-playwright
CHROME=/usr/bin/chromium uv run brand/build.py
```

## Construction

The symbol is drawn on a 512 grid from four measures:

| Measure           | Value                 | Why                                                       |
| ----------------- | --------------------- | --------------------------------------------------------- |
| Sun radius **R**  | 150                   | the grid's unit                                           |
| Line weight **t** | 13.2 (R × 62 / 702)   | the « e »'s crossbar, the word's thinnest stroke          |
| Gap **g**         | t                     | the sun never touches the line, so one colour still reads |
| Wave crest        | t                     | the wave stays a ripple, not a sea                        |
| Horizon           | R + 50 each side      |                                                           |
| Waves             | 2 across the diameter | under a Hann window: no kink where the line turns         |

- The line is 5 cubic Béziers, nodes on the extremes, handles horizontal.
- The sun is cut by the wave's parallel along its normal, so the gap keeps its width on the slopes.

## Lockup

In font units of the wordmark (Bricolage Grotesque, weight 500, width 85 %, tracking −1.5 %,
outlined with HarfBuzz's kerning):

- the horizon is the word's baseline;
- the sun rises to the « b »'s ascender, so R = 702 units;
- half an x-height separates the end of the line from the « a »;
- clear space all around: one x-height.

## Sizes

| Size         | Drawing                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| 48 px and up | the construction above                                                                   |
| 32 px        | its own drawing: a 2 px line on whole pixels, 1.5 waves (`symbol-32.svg`, `favicon.svg`) |
| 16 px        | pixel by pixel: the wave in one-pixel steps (`symbol-16.svg`, in `favicon.ico`)          |

`favicon.svg` is the 32 px drawing: at 16 CSS px on a 2× screen it lands on whole pixels, and its
line turns to paper on a dark tab strip.

## Files

| File                                  | Use                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `svg/symbol*.svg`, `svg/lockup*.svg`  | colour, one colour, inverse: press, partners, other surfaces                                                                         |
| `public/favicon.ico`                  | 16 and 32 px, each its own drawing                                                                                                   |
| `public/favicon.svg`                  | browser tab                                                                                                                          |
| `public/icon-180.png`                 | iOS home screen                                                                                                                      |
| `public/icon-192.png`, `icon-512.png` | manifest, Android splash, Cast metadata                                                                                              |
| `public/icon-maskable-512.png`        | Android adaptive icon: the symbol inside the 40 % radius circle every mask keeps ([web.dev](https://web.dev/articles/maskable-icon)) |
| `public/og-fr.png`, `og-en.png`       | sharing cards, 1200 × 630                                                                                                            |
| `src/design/atoms/logoArt.ts`         | the lockup's parts for `Logo.tsx`                                                                                                    |

The favicon set follows Evil Martians' [How to Favicon](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs).

## Motion

`Logo intro` plays once per page load, 1.6 s (`tokens.css`):

1. the horizon is drawn left to right, 0.9 s;
2. the sun rises from behind it, from 0.35 s;
3. the letters rise from the baseline one after another, from 0.55 s, 45 ms apart.

On hover, the link's wave swells once. With `prefers-reduced-motion: reduce` the logo simply
stands.
