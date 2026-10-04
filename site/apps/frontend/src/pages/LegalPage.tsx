import type { ReactNode } from 'react';
import * as m from '@/paraglide/messages.js';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline m-0">{title}</h2>
      <div className="text-body text-text-muted flex max-w-prose flex-col gap-3">{children}</div>
    </section>
  );
}

const CONTACT = 'contact@aubesonore.fr';

/** Legal notice and privacy policy, pre-rendered in each language. */
export function LegalPage() {
  const mail = (
    <a href={`mailto:${CONTACT}`} className="text-text underline decoration-1 underline-offset-4">
      {CONTACT}
    </a>
  );
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-12 px-6 py-12 md:px-10 md:py-20">
      <a href={m.legal_home_href()} className="text-headline condensed self-start font-bold">
        aubesonore
      </a>
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
  );
}
