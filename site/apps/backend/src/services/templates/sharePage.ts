import {
  coverArtUrl,
  PLATFORM_NAMES,
  type PlatformLinks,
  type SiteLocale,
} from '@aubesonore/shared-types/client';
import type { TrackLinks } from '../trackLinksService';
import { env } from '../../config/env';
import { escapeHtml } from './escapeHtml';

const COPY: Record<
  SiteLocale,
  {
    description: string;
    coverAlt: (title: string) => string;
    heardOn: string;
    listenLive: string;
    listenOn: (platform: string) => string;
    footer: string;
  }
> = {
  fr: {
    description:
      'Entendu sur AubeSonore, la radio de découverte indé, électro, hip-hop. Écoutez le direct.',
    coverAlt: (title) => `Pochette de ${title}`,
    heardOn: 'Entendu sur AubeSonore',
    listenLive: 'Écouter le direct',
    listenOn: (platform) => `Écouter sur ${platform}`,
    footer: 'AubeSonore, radio de découverte indé, électro, hip-hop',
  },
  en: {
    description:
      'Heard on AubeSonore, the indie, electronic, hip-hop discovery radio. Listen live.',
    coverAlt: (title) => `Cover of ${title}`,
    heardOn: 'Heard on AubeSonore',
    listenLive: 'Listen live',
    listenOn: (platform) => `Listen on ${platform}`,
    footer: 'AubeSonore, an indie, electronic, hip-hop discovery radio',
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
  // cover store's WebP.
  const ogImage = releaseGroup
    ? `\n    <meta property="og:image" content="${escapeHtml(coverArtUrl(releaseGroup, 500))}" />`
    : '';
  const cover = releaseGroup
    ? `\n      <img class="cover" src="${escapeHtml(`${env.FRONTEND_BASE_URL}/covers/caa/${releaseGroup}/500.webp`)}" alt="${escapeHtml(copy.coverAlt(title))}" width="240" height="240" />`
    : '';
  const platforms =
    platformLinks.length > 0
      ? `\n      <nav class="platforms">\n${platformLinks
          .map(
            ([id, url]) =>
              `        <a class="platform" href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(copy.listenOn(PLATFORM_NAMES[id]))}</a>`
          )
          .join('\n')}\n      </nav>`
      : '';

  // The site's paper, ink, muted ink and dawn (apps/frontend/src/design/tokens.css), as hex.
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
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
      * { margin: 0; box-sizing: border-box; }
      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem 1rem;
        font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #211f26;
        background: radial-gradient(60% 40% at 50% 100%, #f2ac8166 0%, transparent 70%), #e8e0d7;
      }
      .card { width: 100%; max-width: 24rem; text-align: center; }
      .cover {
        width: 240px;
        height: 240px;
        max-width: 100%;
        border-radius: 0.5rem;
        object-fit: cover;
        box-shadow: 0 18px 40px -16px rgb(33 31 38 / 45%);
      }
      h1 { margin-top: 1.5rem; font-size: 1.75rem; line-height: 1.15; font-weight: 600; letter-spacing: -0.02em; }
      .artist { margin-top: 0.375rem; font-size: 1.125rem; color: #4a4650; }
      .heard { margin-top: 1rem; font-size: 0.875rem; color: #4a4650; }
      .cta {
        display: inline-block;
        margin-top: 1.5rem;
        padding: 0.875rem 1.75rem;
        font-size: 1rem;
        font-weight: 600;
        color: #e8e0d7;
        background: #211f26;
        border-radius: 9999px;
        text-decoration: none;
      }
      .platforms { margin-top: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
      .platform {
        display: block;
        padding: 0.75rem 1rem;
        font-size: 0.9375rem;
        color: #211f26;
        border: 1px solid #211f26;
        border-radius: 9999px;
        text-decoration: none;
      }
      footer { margin-top: 2rem; font-size: 0.75rem; color: #4a4650; }
    </style>
  </head>
  <body>
    <main class="card">${cover}
      <h1>${escapeHtml(title)}</h1>
      <p class="artist">${escapeHtml(artist)}</p>
      <p class="heard">${copy.heardOn}</p>
      <a class="cta" href="${escapeHtml(env.FRONTEND_BASE_URL)}">${copy.listenLive}</a>${platforms}
      <footer>${copy.footer}</footer>
    </main>
  </body>
</html>
`;
}
