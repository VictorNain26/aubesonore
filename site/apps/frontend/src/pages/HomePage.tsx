import { Hero } from '../home/Hero';
import { SinceDawn } from '../home/SinceDawn';
import { MostKept } from '../home/MostKept';
import { SiteFooter } from '../home/SiteFooter';

export default function HomePage() {
  return (
    <>
      <main id="main">
        <Hero />
        <div className="px-page flex flex-col gap-16 py-12 md:gap-28 md:pb-20">
          <SinceDawn />
          <MostKept />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
