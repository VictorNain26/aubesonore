import { useEffect } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { Hero } from '../home/Hero';
import { MostKept } from '../home/MostKept';
import { SiteFooter } from '../shell/SiteFooter';
import type { HomeData } from '../lib/homeData';
import { useDocumentTitle } from '../hooks/usePageTitle';
import * as m from '@/paraglide/messages.js';

/** The home page, its lists from its loader (lib/homeData.ts, routes.tsx). */
export function HomePage() {
  // Null when the page was hydrated as pre-rendered, without its lists (main.tsx): they are asked
  // once it is drawn, through the router (useRevalidator runs its loader again).
  const data = useLoaderData<HomeData | null>();
  const revalidator = useRevalidator();
  // The site's name, as the pre-rendered page says it: else the tab keeps the page left behind's.
  useDocumentTitle(m.meta_title());
  useEffect(() => {
    if (data === null && revalidator.state === 'idle') void revalidator.revalidate();
  }, [data, revalidator]);

  return (
    <>
      <main id="main">
        <Hero history={data?.history ?? null} />
        <MostKept trends={data?.trends ?? null} />
      </main>
      <SiteFooter />
    </>
  );
}
