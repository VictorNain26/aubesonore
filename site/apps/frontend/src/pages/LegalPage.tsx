import { useEffect, type ReactNode } from 'react';
import * as m from '@/paraglide/messages.js';
import { SiteHeader } from '../home/SiteHeader';
import { SiteFooter } from '../home/SiteFooter';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline m-0">{title}</h2>
      <div className="text-body text-text-muted flex max-w-prose flex-col gap-3">{children}</div>
    </section>
  );
}

const CONTACT = 'contact@aubesonore.fr';
const LINK = 'text-text underline decoration-1 underline-offset-4';

/** Legal notice and privacy policy, pre-rendered in each language and hydrated like any page. */
export function LegalPage() {
  // Reached inside the app, the tab says where the listener is; pre-rendered, the head already does.
  useEffect(() => {
    document.title = `${m.legal_title()} · AubeSonore`;
  }, []);
  const mail = (
    <a href={`mailto:${CONTACT}`} className={LINK}>
      {CONTACT}
    </a>
  );
  return (
    <>
      <SiteHeader />
      <main id="main" className="px-page flex flex-col gap-12 py-16 md:py-28">
        <div className="flex flex-col gap-3">
          <h1 className="text-section m-0">{m.legal_title()}</h1>
          <p className="text-text-muted m-0">{m.legal_updated()}</p>
        </div>
        <Section title={m.legal_publisher_title()}>
          <p className="m-0">{m.legal_publisher_body()}</p>
          <p className="m-0">
            {m.legal_contact()} {mail}
          </p>
        </Section>
        <Section title={m.legal_hosting_title()}>
          <p className="m-0">{m.legal_hosting_body()}</p>
        </Section>
        <Section title={m.legal_data_title()}>
          <p className="m-0">{m.legal_data_controller()}</p>
          <p className="m-0">{m.legal_data_collected()}</p>
          <p className="m-0">{m.legal_data_purpose()}</p>
          <p className="m-0">{m.legal_data_processors()}</p>
          {/* YouTube API Services Developer Policies III.A.1-2: a link to YouTube's Terms of
              Service, and the Google Privacy Policy at the address they give. */}
          <p className="m-0">
            {m.legal_youtube_intro()}{' '}
            <a href="https://www.youtube.com/t/terms" className={LINK}>
              {m.legal_youtube_terms()}
            </a>
            {m.legal_youtube_privacy_intro()}{' '}
            <a href="http://www.google.com/policies/privacy" className={LINK}>
              {m.legal_youtube_privacy()}
            </a>
            .
          </p>
          <p className="m-0">{m.legal_data_retention()}</p>
          <p className="m-0">
            {m.legal_data_rights()} {mail}. {m.legal_data_cnil()}
          </p>
        </Section>
        <Section title={m.legal_cookies_title()}>
          <p className="m-0">{m.legal_cookies_body()}</p>
        </Section>
        <Section title={m.legal_credits_title()}>
          <p className="m-0">{m.legal_credits_sources()}</p>
          <p className="m-0">{m.about_credit()}</p>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
