import { StrictMode, type ReactElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { StaticRouter } from 'react-router';
import { overwriteGetLocale, type Locale } from './paraglide/runtime.js';
import * as m from './paraglide/messages.js';
import { useLocaleStore } from './stores/localeStore';
import App from './App';
import { NotFoundPage } from './pages/NotFoundPage';
import { LegalPage } from './pages/LegalPage';

async function toHtml(element: ReactElement): Promise<string> {
  const { prelude } = await prerenderToNodeStream(<StrictMode>{element}</StrictMode>);
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

/** The home page as a crawler without JavaScript should read it, in one language. */
export function pageHtml(locale: Locale): Promise<string> {
  overwriteGetLocale(() => locale);
  useLocaleStore.setState({ locale });
  return toHtml(
    <StaticRouter location={locale === 'en' ? '/en/' : '/'}>
      <App />
    </StaticRouter>
  );
}

/** Pages served as plain HTML, never hydrated. */
export function staticPageHtml(page: 'notFound' | 'legal', locale: Locale): Promise<string> {
  overwriteGetLocale(() => locale);
  return toHtml(page === 'notFound' ? <NotFoundPage /> : <LegalPage />);
}

export function meta(
  locale: Locale,
  page: 'home' | 'legal' | 'notFound' = 'home'
): { title: string; description: string } {
  if (page === 'notFound') {
    return {
      title: 'Page introuvable · AubeSonore',
      description: "Un blanc à l'antenne : cette page n'existe pas, ou plus.",
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
