import { StrictMode, type ReactElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { StaticRouter } from 'react-router';
import { overwriteGetLocale, type Locale } from './paraglide/runtime.js';
import * as m from './paraglide/messages.js';
import { useLocaleStore } from './stores/localeStore';
import App from './App';

async function toHtml(element: ReactElement): Promise<string> {
  const { prelude } = await prerenderToNodeStream(<StrictMode>{element}</StrictMode>);
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * A page as a crawler without JavaScript should read it, in one language: the home page, the
 * legal page, or the 404 (rendered at a path no route knows). The client hydrates each.
 */
export function pageHtml(locale: Locale, path = locale === 'en' ? '/en/' : '/'): Promise<string> {
  overwriteGetLocale(() => locale);
  useLocaleStore.setState({ locale });
  return toHtml(
    <StaticRouter location={path}>
      <App />
    </StaticRouter>
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
    const title = m.legal_title({}, { locale });
    return { title: `${title} · AubeSonore`, description: title };
  }
  return {
    title: m.meta_title({}, { locale }),
    description: m.meta_description({}, { locale }),
  };
}
