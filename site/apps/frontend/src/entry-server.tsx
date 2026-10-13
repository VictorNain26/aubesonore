import { StrictMode, type ReactElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import { overwriteGetLocale, type Locale } from './paraglide/runtime.js';
import * as m from './paraglide/messages.js';
import { useLocaleStore } from './stores/localeStore';
import { seedArtistPage, type ArtistLoaded, type ArtistPageData } from './lib/artistPageData';
import { routes } from './routes';

const handler = createStaticHandler(routes);

async function toHtml(element: ReactElement): Promise<string> {
  // In one piece: past progressiveChunkSize (12,800 bytes by default) React sends a finished
  // Suspense boundary hidden, with an inline script to reveal it, which the site's CSP blocks
  // (script-src 'self'). An artist page is ~85 KB.
  // https://react.dev/reference/react-dom/static/prerenderToNodeStream#parameters
  const { prelude } = await prerenderToNodeStream(<StrictMode>{element}</StrictMode>, {
    progressiveChunkSize: Number.POSITIVE_INFINITY,
  });
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * A page as a crawler without JavaScript should read it, in one language: the home page, the
 * legal page, or the 404 (rendered at a path no route knows). The client hydrates each.
 */
export async function pageHtml(
  locale: Locale,
  path = locale === 'en' ? '/en/' : '/',
  pageData: unknown = null
): Promise<string> {
  overwriteGetLocale(() => locale);
  useLocaleStore.setState({ locale });
  // The origin is a placeholder: the routes match on the path.
  // No loader runs here: the server draws from the data it is given (dataStrategy, React Router's
  // hook over how loaders run). A page that has a loader gets that data in its stead, null for
  // the home page, pre-rendered without its lists.
  const context = await handler.query(new Request(new URL(path, 'http://aubesonore.local')), {
    dataStrategy: ({ matches }) =>
      Promise.resolve(
        Object.fromEntries(
          matches
            .filter((match) => match.shouldLoad)
            .map((match) => [match.route.id, { type: 'data' as const, result: pageData }])
        )
      ),
  });
  if (context instanceof Response) throw new Error(`${path} answered ${context.status}`);
  // hydrate={false}: no inline hydration script, which the CSP (script-src 'self') blocks;
  // main.tsx hydrates from the page itself.
  return toHtml(
    <StaticRouterProvider
      router={createStaticRouter(handler.dataRoutes, context)}
      context={context}
      hydrate={false}
    />
  );
}

/**
 * An artist page at its path, drawn from the data the backend holds, as a crawler without
 * JavaScript should read it. The page embeds the same data: the client starts from it.
 */
export function artistPageHtml(data: ArtistPageData, path: string): Promise<string> {
  seedArtistPage(data);
  const loaded: ArtistLoaded = {
    state: { status: 'ready', profile: data.profile },
    musilogy: data.musilogy,
  };
  return pageHtml(data.locale, path, loaded);
}

/**
 * The renderer's render before it listens (scripts/renderer.mjs): it loads the artist page's
 * code and warms the JIT. Typed here, so its profile follows ArtistProfile.
 */
export function warmUp(): Promise<string> {
  return artistPageHtml(
    {
      locale: 'fr',
      profile: {
        id: 'warm-up',
        name: 'AubeSonore',
        slug: 'warm-up',
        mbid: null,
        played: true,
        images: [],
        facts: null,
        summary: null,
        links: [],
      },
      musilogy: null,
    },
    '/artiste/warm-up'
  );
}

export function meta(
  locale: Locale,
  page: 'home' | 'legal' | 'notFound' = 'home'
): { title: string; description: string } {
  if (page === 'notFound') {
    return {
      title: `${m.notfound_meta_title({}, { locale })} · AubeSonore`,
      description: m.notfound_body({}, { locale }),
    };
  }
  if (page === 'legal') {
    return {
      title: `${m.legal_title({}, { locale })} · AubeSonore`,
      description: m.legal_meta_description({}, { locale }),
    };
  }
  return {
    title: m.meta_title({}, { locale }),
    description: m.meta_description({}, { locale }),
  };
}
