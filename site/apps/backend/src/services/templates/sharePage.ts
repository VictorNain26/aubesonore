import {
  coverArtUrl,
  PLATFORM_NAMES,
  type PlatformLinks,
  type SiteLocale,
} from '@aubesonore/shared-types/client';
import type { TrackLinks } from '../trackLinksService';
import { env } from '../../config/env';
import { escapeHtml } from './escapeHtml';
import { LOCKUP } from './lockup';

const COPY: Record<
  SiteLocale,
  {
    description: string;
    coverAlt: (title: string) => string;
    heardOn: string;
    listenLive: string;
    elsewhere: string;
    listenOn: (platform: string) => string;
  }
> = {
  fr: {
    description:
      'Entendu sur AubeSonore, la radio de découverte indé, électro, hip-hop. Écoutez le direct.',
    coverAlt: (title) => `Pochette de ${title}`,
    heardOn: 'Entendu sur AubeSonore',
    listenLive: 'Écouter le direct',
    elsewhere: 'Écouter ailleurs',
    listenOn: (platform) => `Écouter sur ${platform}`,
  },
  en: {
    description:
      'Heard on AubeSonore, the indie, electronic, hip-hop discovery radio. Listen live.',
    coverAlt: (title) => `Cover of ${title}`,
    heardOn: 'Heard on AubeSonore',
    listenLive: 'Listen live',
    elsewhere: 'Listen elsewhere',
    listenOn: (platform) => `Listen on ${platform}`,
  },
};

interface SharePageInput {
  title: string;
  artist: string;
  /** Canonical URL of this share page, used for og:url. */
  shareUrl: string;
  links: TrackLinks | null;
  /** The record whose Cover Art Archive cover a kept copy of the track has. */
  releaseGroup: string | null;
  locale?: SiteLocale;
}

// Static HTML page (no JS): link crawlers must read the OG meta without executing scripts, so the
// CSP allows only inline styles and https images. Kept out of search results: one page per track
// someone shared is a sharing card, not a page to find (link previews ignore robots).
export function renderSharePage({
  title,
  artist,
  shareUrl,
  links,
  releaseGroup,
  locale = 'fr',
}: SharePageInput): string {
  const copy = COPY[locale];
  const platformLinks = links
    ? (Object.entries(links.platformLinks) as Array<[keyof PlatformLinks, string]>).filter(
        ([, url]) => url.startsWith('https://')
      )
    : [];

  // Link previews take the archive's JPEG, like the artist page's og:image; the page shows the
  // cover store's WebP, and lays it blurred behind everything, as the home page's hero does.
  const ogImage = releaseGroup
    ? `\n    <meta property="og:image" content="${escapeHtml(coverArtUrl(releaseGroup, 500))}" />`
    : '';
  const coverSrc = releaseGroup
    ? escapeHtml(`${env.FRONTEND_BASE_URL}/covers/caa/${releaseGroup}/500.webp`)
    : null;
  const light = coverSrc
    ? `\n    <div class="light" aria-hidden="true"><img src="${coverSrc}" alt="" /></div>`
    : '';
  const cover = coverSrc
    ? `\n      <img class="cover" src="${coverSrc}" alt="${escapeHtml(copy.coverAlt(title))}" width="420" height="420" />`
    : '';
  const platforms =
    platformLinks.length > 0
      ? `\n      <nav class="platforms" aria-label="${copy.elsewhere}">\n${platformLinks
          .map(
            ([id, url]) =>
              `        <a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(copy.listenOn(PLATFORM_NAMES[id]))}</a>`
          )
          .join('\n')}\n      </nav>`
      : '';
  const home = escapeHtml(env.FRONTEND_BASE_URL);
  const lockup = `<a class="home" href="${home}"><picture><source srcset="${escapeHtml(LOCKUP.night)}" media="(prefers-color-scheme: dark)" /><img src="${escapeHtml(LOCKUP.day)}" alt="${LOCKUP.alt}" width="${LOCKUP.width}" height="${LOCKUP.height}" /></picture></a>`;

  // The site's charter (apps/frontend/src/design/tokens.css) as hex, by day and by night: the
  // paper, the ink, the muted ink, and the veil over the cover's light (--light-*). No web font:
  // Fraunces where installed, else Georgia.
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escapeHtml(title)}, ${escapeHtml(artist)} · AubeSonore</title>
    <meta name="description" content="${copy.description}" />
    <meta name="robots" content="noindex" />
    <meta property="og:title" content="« ${escapeHtml(title)} », ${escapeHtml(artist)}" />
    <meta property="og:description" content="${copy.description}" />
    <meta property="og:type" content="music.song" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="og:site_name" content="AubeSonore" />
    <meta property="og:locale" content="${locale === 'en' ? 'en_GB' : 'fr_FR'}" />
    <meta name="twitter:card" content="${releaseGroup ? 'summary_large_image' : 'summary'}" />${ogImage}
    <style>
      :root {
        --surface: #f1e5dc;
        --text: #1b233a;
        --text-muted: #454b69;
        --light-opacity: 0.75;
        --light-veil-top: rgb(241 229 220 / 0.55);
        --light-veil-mid: rgb(241 229 220 / 0.72);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --surface: #151d33;
          --text: #f0e6db;
          --text-muted: #b9bcd1;
          --light-opacity: 0.9;
          --light-veil-top: rgb(10 16 35 / 0.38);
          --light-veil-mid: rgb(13 21 42 / 0.62);
        }
      }
      * { margin: 0; box-sizing: border-box; }
      body {
        min-height: 100vh;
        font-family: 'Atkinson Hyperlegible Next', system-ui, sans-serif;
        color: var(--text);
        background: var(--surface);
      }
      .light { position: fixed; inset: 0; overflow: hidden; }
      .light img {
        position: absolute;
        left: -15%;
        top: -25%;
        width: 130%;
        height: 150%;
        object-fit: cover;
        filter: blur(80px) saturate(1.35);
        opacity: var(--light-opacity);
      }
      .light::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom, var(--light-veil-top) 0%, var(--light-veil-mid) 70%, var(--surface) 100%);
      }
      main {
        position: relative;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 20px 72px;
        text-align: center;
      }
      a { color: inherit; }
      .home { display: flex; align-items: center; min-height: 44px; margin-bottom: 28px; }
      .home img { display: block; }
      .cover { display: block; width: 300px; height: 300px; max-width: 100%; object-fit: cover; }
      h1 {
        max-width: 20ch;
        margin-top: 24px;
        font-family: Fraunces, Georgia, 'Times New Roman', serif;
        font-size: clamp(1.875rem, 1.364rem + 2.095vw, 3.25rem);
        line-height: 1.03;
        font-weight: 400;
        letter-spacing: -0.025em;
        text-wrap: balance;
      }
      .artist { margin-top: 8px; font-size: 19px; }
      .heard { margin-top: 6px; font-size: 16px; color: var(--text-muted); }
      .cta {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 56px;
        margin-top: 24px;
        padding: 0 28px 0 22px;
        border-radius: 9999px;
        background: var(--text);
        color: var(--surface);
        font-size: 16px;
        font-weight: 600;
        text-decoration: none;
      }
      .platforms {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0 22px;
        margin-top: 14px;
        font-size: 16px;
        font-weight: 600;
      }
      .platforms a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        text-decoration-color: var(--text-muted);
        text-underline-offset: 5px;
      }
      @media (min-width: 768px) {
        .cover { width: 420px; height: 420px; }
      }
    </style>
  </head>
  <body>${light}
    <main>
      ${lockup}${cover}
      <h1>${escapeHtml(title)}</h1>
      <p class="artist">${escapeHtml(artist)}</p>
      <p class="heard">${copy.heardOn}</p>
      <a class="cta" href="${home}"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5v13a.6.6 0 0 0 .9.5l10.4-6.5a.6.6 0 0 0 0-1L6.9 3a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>${copy.listenLive}</a>${platforms}
    </main>
  </body>
</html>
`;
}
