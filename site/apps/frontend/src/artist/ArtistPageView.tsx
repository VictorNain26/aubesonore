import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type {
  ArtistFacts,
  ArtistPlatform,
  ArtistProfile,
  ArtistSummary,
} from '@aubesonore/shared-types/client';
import { getLocale, localizeHref } from '@/paraglide/runtime.js';
import { Cover } from '../home/Cover';
import { TEXT_ACTION } from '../home/styles';
import * as m from '@/paraglide/messages.js';

export type ArtistPageState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; profile: ArtistProfile };

const PLATFORM_LABELS: Record<ArtistPlatform, () => string> = {
  deezer: () => 'Deezer',
  spotify: () => 'Spotify',
  appleMusic: () => 'Apple Music',
  bandcamp: () => 'Bandcamp',
  soundcloud: () => 'SoundCloud',
  official: () => m.artist_link_official(),
};

const KIND_LABELS: Record<NonNullable<ArtistFacts['kind']>, () => string> = {
  person: () => m.artist_kind_person(),
  group: () => m.artist_kind_group(),
  orchestra: () => m.artist_kind_orchestra(),
  choir: () => m.artist_kind_choir(),
};

// Wikipedia text is CC BY-SA: the article and the licence are both linked.
// https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

/** "Groupe · Paris, France · 1993 – 2021": what MusicBrainz states, nothing more. */
export function factsLine(facts: ArtistFacts): string | null {
  const country = facts.country
    ? new Intl.DisplayNames([getLocale()], { type: 'region' }).of(facts.country)
    : undefined;
  const where = [facts.place, country].filter(Boolean).join(', ');
  const formed = facts.formed ? String(facts.formed) : null;
  const when = !formed
    ? ''
    : facts.ended
      ? `${formed} – ${facts.ended}`
      : facts.active
        ? m.artist_since({ year: formed })
        : m.artist_formed({ year: formed });
  const parts = [facts.kind ? KIND_LABELS[facts.kind]() : '', where, when].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatPlayedAt(iso: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

function Section({
  id,
  title,
  body,
  children,
}: {
  id: string;
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16"
    >
      <div className="reveal flex flex-col gap-2 self-start md:gap-3">
        <h2 id={`${id}-title`} className="text-section m-0">
          {title}
        </h2>
        {body ? <p className="text-text-muted max-w-blurb m-0">{body}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-6 px-6 pt-5 md:px-10 md:pt-7">
      <Link
        to={localizeHref('/')}
        className="text-mark condensed ease-out-quart focus-visible:outline-accent inline-flex min-h-11 items-center rounded-sm transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        aubesonore
      </Link>
      <Link to={localizeHref('/')} className={TEXT_ACTION}>
        {m.artist_back()}
      </Link>
    </header>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="lift-in flex flex-col gap-4 px-6 py-24 md:px-10">
      <h1 className="text-hero m-0">{title}</h1>
      <p className="text-intro text-text-muted max-w-blurb m-0">{body}</p>
    </div>
  );
}

const OUTSIDE_LINK = { rel: 'noopener noreferrer', target: '_blank' } as const;

function Summary({ summary }: { summary: ArtistSummary }) {
  return (
    <figure className="m-0 flex flex-col gap-3 md:col-span-8 md:col-start-5 lg:col-span-7 lg:col-start-4">
      <blockquote cite={summary.url} lang={summary.lang} className="m-0">
        <p className="text-intro m-0 max-w-prose">{summary.text}</p>
      </blockquote>
      <figcaption className="text-label text-text-muted flex items-center gap-3 font-mono uppercase">
        <a href={summary.url} {...OUTSIDE_LINK} className={TEXT_ACTION}>
          {summary.lang === getLocale()
            ? m.artist_summary_source()
            : m.artist_summary_source_other()}
        </a>
        <span aria-hidden="true">·</span>
        <a href={LICENSE_URL} {...OUTSIDE_LINK} className={TEXT_ACTION}>
          CC BY-SA 4.0
        </a>
      </figcaption>
    </figure>
  );
}

function Profile({ profile }: { profile: ArtistProfile }) {
  const facts = profile.facts ? factsLine(profile.facts) : null;

  return (
    <>
      <div className="lift-in grid gap-6 px-6 pt-10 md:grid-cols-12 md:items-end md:gap-x-10 md:gap-y-12 md:px-10 md:pt-16">
        <Cover
          src={profile.image}
          alt={m.artist_portrait_alt({ name: profile.name })}
          seed={profile.name}
          priority
          className="aspect-square w-40 md:col-span-4 md:w-full lg:col-span-3"
        />
        <div className="flex min-w-0 flex-col gap-3 md:col-span-8 lg:col-span-9">
          <h1 className="text-hero m-0 break-words">{profile.name}</h1>
          {facts ? <p className="text-sub text-text-muted m-0">{facts}</p> : null}
        </div>
        {profile.summary ? <Summary summary={profile.summary} /> : null}
      </div>

      <div className="flex flex-col gap-16 px-6 py-12 md:gap-28 md:px-10 md:py-20">
        <Section id="played" title={m.artist_played_title()} body={m.artist_played_body()}>
          {profile.playedOnRadio.length > 0 ? (
            <ol className="border-accent m-0 list-none border-t p-0">
              {profile.playedOnRadio.map((play) => (
                <li
                  key={`${play.playedAt}-${play.title}`}
                  className="border-border reveal grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b py-2 md:px-1"
                >
                  <span className="text-row truncate">{play.title}</span>
                  <span className="text-ui text-text-muted font-mono whitespace-nowrap tabular-nums">
                    {formatPlayedAt(play.playedAt)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-text-muted border-accent m-0 border-t pt-4">
              {m.artist_played_empty()}
            </p>
          )}
        </Section>

        {profile.links.length > 0 ? (
          <Section id="listen" title={m.artist_listen_title()} body={m.artist_listen_body()}>
            <ul className="border-accent m-0 flex list-none flex-wrap gap-x-8 border-t p-0 pt-2">
              {profile.links.map((link) => (
                <li key={link.url} className="reveal">
                  <a href={link.url} {...OUTSIDE_LINK} className={TEXT_ACTION}>
                    {PLATFORM_LABELS[link.platform]()}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </>
  );
}

/** An artist heard on the antenna: who they are, what the radio played, where to hear more. */
export function ArtistPageView({ state }: { state: ArtistPageState }) {
  return (
    <main id="main" className="min-h-dvh">
      <Header />
      {state.status === 'loading' ? (
        <div aria-busy="true" className="flex flex-col gap-6 px-6 pt-10 md:px-10 md:pt-16">
          <span className="bg-surface-raised aspect-square w-40 rounded-sm md:w-60" />
          <span className="bg-surface-raised h-12 w-2/3 rounded-sm" />
        </div>
      ) : state.status === 'missing' ? (
        <Message title={m.artist_missing_title()} body={m.artist_missing_body()} />
      ) : state.status === 'error' ? (
        <Message title={m.artist_error_title()} body={m.artist_error_body()} />
      ) : (
        <Profile profile={state.profile} />
      )}
    </main>
  );
}
