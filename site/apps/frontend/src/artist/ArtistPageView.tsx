import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type {
  ArtistFacts,
  ArtistPlatform,
  ArtistProfile,
  ArtistRadioTitle,
  ArtistSummary,
  ClientLikedTrack,
} from '@aubesonore/shared-types/client';
import { getLocale } from '@/paraglide/runtime.js';
import { Cover } from '../home/Cover';
import { KeepHeart } from '../home/KeepHeart';
import { musilogyPath } from '../lib/musilogy';
import { ARTIST_LINK, TEXT_ACTION } from '../home/styles';
import * as m from '@/paraglide/messages.js';
import { SiteHeader } from '../home/SiteHeader';

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

// Wikipedia text is CC BY-SA 4.0: the excerpt links its article, which names
// its authors and licence, and the legal page credits the licence. A link to a
// resource holding the attribution is a reasonable manner (CC BY-SA 4.0 §3(a)(2)).
// No source or licence is named on the page itself: it speaks to listeners.

/** "Groupe · Paris, France · 1993 – 2021": what MusicBrainz states, nothing more. */
export function factsLine(facts: ArtistFacts): string | null {
  const where = whereOf(facts);
  const formed = facts.formed ? String(facts.formed) : null;
  const when = !formed
    ? ''
    : facts.ended
      ? m.years_range({ from: formed, to: String(facts.ended) })
      : facts.active
        ? m.artist_since({ year: formed })
        : m.artist_formed({ year: formed });
  const parts = [facts.kind ? KIND_LABELS[facts.kind]() : '', where, when].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function whereOf(facts: ArtistFacts): string {
  const country = facts.country
    ? new Intl.DisplayNames([getLocale()], { type: 'region' }).of(facts.country)
    : undefined;
  return [facts.place, country].filter(Boolean).join(', ');
}

/**
 * The same facts in a sentence, for an artist without a Wikipedia article:
 * "Groupe originaire de Paris, France, formé en 1993. Actif jusqu'en 2021."
 */
export function portraitSentence(facts: ArtistFacts): string | null {
  const kind = facts.kind ? KIND_LABELS[facts.kind]() : KIND_LABELS.person();
  const where = whereOf(facts);
  const year = facts.formed ? String(facts.formed) : null;
  const origin =
    where && year
      ? m.artist_portrait_from_formed({ kind, where, year })
      : where
        ? m.artist_portrait_from({ kind, where })
        : year
          ? m.artist_portrait_formed({ kind, year })
          : null;
  if (!origin) return null;
  const end = facts.ended
    ? m.artist_portrait_until({ year: String(facts.ended) })
    : facts.active
      ? m.artist_portrait_active()
      : null;
  return end ? `${origin} ${end}` : origin;
}

function formatKeptAt(iso: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** The day of a play: the year only when it is not this one. */
function formatPlayedDay(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

/** Garder on a played title; the container brings the store. */
export interface KeepOnPage {
  isKept: (title: string, artist: string) => boolean;
  isKeeping: (title: string, artist: string) => boolean;
  onToggle: (played: ArtistRadioTitle) => void;
}

const KEEP_BUTTON =
  'group ease-out-quart focus-visible:outline-accent flex size-11 items-center justify-center rounded-full transition-[scale] duration-150 focus-visible:outline-2 active:scale-90 disabled:opacity-50';

/** One title the antenna plays: what it is (on Deezer, when known), how often, then keep it. */
function PlayedRow({ played, keep }: { played: ArtistRadioTitle; keep: KeepOnPage | null }) {
  const day = formatPlayedDay(played.lastPlayedAt);
  return (
    <li className="border-border reveal grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 border-b py-2 md:gap-x-6 md:px-1">
      <Cover
        src={played.deezer?.cover}
        alt=""
        seed={`${played.artist}|${played.title}`}
        className="size-11"
      />
      <span className="flex min-w-0 flex-col">
        {played.deezer ? (
          // Negative margins grow the tap target to 44px without moving the row.
          <a
            href={played.deezer.link}
            {...OUTSIDE_LINK}
            aria-label={m.artist_listen_on_deezer({ title: played.title })}
            className={`${ARTIST_LINK} text-row -my-3 truncate py-3 underline-offset-4`}
          >
            {played.title}
          </a>
        ) : (
          <span className="text-row truncate">{played.title}</span>
        )}
        <span className="text-sub text-text-muted truncate">
          {played.plays > 1
            ? m.artist_played_many({ count: played.plays, date: day })
            : m.artist_played_once({ date: day })}
        </span>
      </span>
      {keep ? (
        <button
          type="button"
          onClick={() => keep.onToggle(played)}
          disabled={keep.isKeeping(played.title, played.artist)}
          aria-pressed={keep.isKept(played.title, played.artist)}
          aria-label={m.track_keep_aria({ title: played.title })}
          className={KEEP_BUTTON}
        >
          <KeepHeart
            isKept={keep.isKept(played.title, played.artist)}
            className="ease-spring size-4.5 transition-transform duration-250 group-hover:scale-118"
            strokeWidth={1.5}
          />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </li>
  );
}

export function Section({
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
      <div className="reveal-heading flex flex-col gap-2 self-start md:gap-3">
        <h2 id={`${id}-title`} className="text-section m-0">
          {title}
        </h2>
        {body ? <p className="text-intro text-text-muted max-w-blurb m-0">{body}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="lift-in px-page flex flex-col gap-4 py-24">
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
      <figcaption>
        <a href={summary.url} {...OUTSIDE_LINK} className={TEXT_ACTION}>
          {summary.lang === getLocale()
            ? m.artist_summary_source()
            : m.artist_summary_source_other()}
        </a>
      </figcaption>
    </figure>
  );
}

function Portrait({ text }: { text: string }) {
  return (
    <p className="text-intro m-0 max-w-prose md:col-span-8 md:col-start-5 lg:col-span-7 lg:col-start-4">
      {text}
    </p>
  );
}

type KeptTrack = Pick<ClientLikedTrack, 'id' | 'title' | 'createdAt'>;

function Profile({
  profile,
  kept,
  keep,
}: {
  profile: ArtistProfile;
  kept: readonly KeptTrack[];
  keep: KeepOnPage | null;
}) {
  // Without a Wikipedia article, the facts are said in a sentence rather than listed.
  const portrait = !profile.summary && profile.facts ? portraitSentence(profile.facts) : null;
  const facts = profile.facts && !portrait ? factsLine(profile.facts) : null;

  return (
    <>
      <div className="lift-in px-page grid gap-6 pt-10 md:grid-cols-12 md:items-end md:gap-x-10 md:gap-y-12 md:pt-16">
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
        {portrait ? <Portrait text={portrait} /> : null}
        {profile.mbid ? (
          <Link
            to={musilogyPath({ mbid: profile.mbid, name: profile.name })}
            className={`${TEXT_ACTION} md:col-span-8 md:col-start-5 lg:col-span-7 lg:col-start-4`}
          >
            {m.artist_musilogy_link()}
          </Link>
        ) : null}
      </div>

      <div className="px-page flex flex-col gap-16 py-12 md:gap-28 md:py-20">
        {kept.length > 0 ? (
          <Section id="kept" title={m.artist_kept_title()} body={m.artist_kept_body()}>
            <ol className="border-accent m-0 list-none border-t p-0">
              {kept.map((track) => (
                <li
                  key={track.id}
                  className="border-border reveal grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b py-2 md:px-1"
                >
                  <span className="text-row truncate">{track.title}</span>
                  <span className="text-ui text-text-muted font-mono whitespace-nowrap tabular-nums">
                    {formatKeptAt(track.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        ) : (
          <Section id="played" title={m.artist_played_title()} body={m.artist_played_body()}>
            {profile.playedOnRadio.length > 0 ? (
              <ol className="border-accent m-0 list-none border-t p-0">
                {profile.playedOnRadio.map((played) => (
                  <PlayedRow key={played.title} played={played} keep={keep} />
                ))}
              </ol>
            ) : (
              <p className="text-text-muted border-accent m-0 border-t pt-4">
                {m.artist_played_empty()}
              </p>
            )}
          </Section>
        )}

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

/**
 * An artist heard on the antenna: who they are, what the listener kept of them
 * or else what the radio played, where to hear more.
 */
export function ArtistPageView({
  state,
  kept = [],
  keep = null,
}: {
  state: ArtistPageState;
  kept?: readonly KeptTrack[];
  keep?: KeepOnPage | null;
}) {
  return (
    <main id="main" className="min-h-dvh">
      <SiteHeader />
      {state.status === 'loading' ? (
        <div aria-busy="true" className="px-page flex flex-col gap-6 pt-10 md:pt-16">
          <span className="bg-surface-raised aspect-square w-40 rounded-sm md:w-60" />
          <span className="bg-surface-raised h-12 w-2/3 rounded-sm" />
        </div>
      ) : state.status === 'missing' ? (
        <Message title={m.artist_missing_title()} body={m.artist_missing_body()} />
      ) : state.status === 'error' ? (
        <Message title={m.artist_error_title()} body={m.artist_error_body()} />
      ) : (
        <Profile profile={state.profile} kept={kept} keep={keep} />
      )}
    </main>
  );
}
