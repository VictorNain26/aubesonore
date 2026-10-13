import { useEffect } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { Hero } from '../home/Hero';
import { SinceDawn } from '../home/SinceDawn';
import { MostKept } from '../home/MostKept';
import { SiteFooter } from '../shell/SiteFooter';
import type { HomeData } from '../lib/homeData';

/** The home page, its lists from its loader (lib/homeData.ts, routes.tsx). */
export function HomePage() {
  // Null when the page was hydrated as pre-rendered, without its lists (main.tsx): they are asked
  // once it is drawn, through the router (useRevalidator runs its loader again).
  const data = useLoaderData<HomeData | null>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (data === null && revalidator.state === 'idle') void revalidator.revalidate();
  }, [data, revalidator]);

  return (
    <>
      <main id="main">
        <Hero />
        <div className="px-page flex flex-col gap-16 py-16 md:gap-28 md:py-28">
          <SinceDawn history={data?.history ?? null} />
          <MostKept trends={data?.trends ?? null} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
