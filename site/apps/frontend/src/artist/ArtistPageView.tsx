import type {
  ArtistFacts,
  ArtistPlatform,
  ArtistProfile,
  ArtistSummary,
  ClientLikedTrack,
  MusilogyArtist,
} from '@aubesonore/shared-types/client';
import { getLocale, localizeHref } from '@/paraglide/runtime.js';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Cover } from '../home/Cover';
import { ARTIST_LINK, BACK_TO_LIVE } from '../home/styles';
import * as m from '@/paraglide/messages.js';
import { SiteHeader } from '../home/SiteHeader';
import { Section } from '../design/molecules/Section';
import { musilogyNav, MusilogySections } from '../musilogy/MusilogyView';
import { PageNav } from '../design/molecules/PageNav';
import { DiscoveryTrail } from '../design/molecules/DiscoveryTrail';
import type { TrailStep } from '../lib/discoveryTrail';
import { ReleasesSection } from '../musilogy/Releases';

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
/** A page with nothing to show, like the 404: what happened, and the way back to the live. */
function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="lift-in px-page flex flex-1 flex-col justify-center gap-3 py-16">
      <h1 className="text-hero m-0">{title}</h1>
      <p className="text-intro text-text-muted max-w-blurb m-0">{body}</p>
      <p className="m-0 mt-6">
        <Link to={localizeHref('/')} className={BACK_TO_LIVE}>
          {m.artist_back()}
        </Link>
      </p>
    </div>
  );
}

const OUTSIDE_LINK = { rel: 'noopener noreferrer', target: '_blank' } as const;

function Summary({ summary }: { summary: ArtistSummary }) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      <blockquote cite={summary.url} lang={summary.lang} className="m-0">
        <p className="text-intro m-0 max-w-prose">{summary.text}</p>
      </blockquote>
      <figcaption>
        <a
          href={summary.url}
          {...OUTSIDE_LINK}
          className={cn(ARTIST_LINK, 'text-ui -my-3 inline-block py-3 underline-offset-4')}
        >
          {summary.lang === getLocale()
            ? m.artist_summary_source()
            : m.artist_summary_source_other()}
        </a>
      </figcaption>
    </figure>
  );
}

function Portrait({ text }: { text: string }) {
  return <p className="text-intro m-0 max-w-prose">{text}</p>;
}

type KeptTrack = Pick<ClientLikedTrack, 'id' | 'title' | 'createdAt'>;

function Profile({
  profile,
  kept,
  musilogy,
  trail,
  thisYear,
}: {
  profile: ArtistProfile;
  kept: readonly KeptTrack[];
  musilogy: MusilogyArtist | null;
  trail: readonly TrailStep[];
  thisYear: number;
}) {
  // Without a Wikipedia article, the facts are said in a sentence rather than listed.
  const portrait = !profile.summary && profile.facts ? portraitSentence(profile.facts) : null;
  const facts = profile.facts && !portrait ? factsLine(profile.facts) : null;

  return (
    <>
      {/* The sections' 4/8 grid: the portrait in the title column, who they are beside it. */}
      <div className="lift-in px-page grid gap-6 pt-10 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16 md:pt-16">
        <Cover
          src={profile.image}
          alt={m.artist_portrait_alt({ name: profile.name })}
          seed={profile.name}
          priority
          // w-40 on phones; the 4/12 title column from md.
          sizes="(min-width: 48rem) 33vw, 10rem"
          className="aspect-square w-40 md:w-full"
        />
        <div className="flex min-w-0 flex-col gap-3 md:justify-end">
          <DiscoveryTrail steps={trail} />
          <h1 className="text-hero m-0 break-words">{profile.name}</h1>
          {facts ? <p className="text-sub text-text-muted m-0">{facts}</p> : null}
          <div className="mt-3 flex flex-col gap-3">
            {profile.summary ? <Summary summary={profile.summary} /> : null}
            {portrait ? <Portrait text={portrait} /> : null}
          </div>
          <div className="mt-3">
            <PageNav
              items={[
                ...(profile.links.length > 0
                  ? [{ id: 'listen', label: m.artist_listen_title() }]
                  : []),
                ...(musilogy?.releases && musilogy.releases.length > 0
                  ? [{ id: 'records', label: m.artist_records_title() }]
                  : []),
                ...(kept.length > 0 ? [{ id: 'kept', label: m.artist_kept_title() }] : []),
                ...(musilogy ? musilogyNav(musilogy) : []),
              ]}
            />
          </div>
        </div>
      </div>

      <div className="px-page flex flex-col gap-16 py-16 md:gap-28 md:py-28">
        {profile.links.length > 0 ? (
          <Section id="listen" title={m.artist_listen_title()}>
            <ul className="m-0 flex list-none flex-wrap gap-x-8 gap-y-2 p-0">
              {profile.links.map((link) => (
                <li key={link.url} className="reveal">
                  <a
                    href={link.url}
                    {...OUTSIDE_LINK}
                    className={cn(
                      ARTIST_LINK,
                      'text-ui inline-flex min-h-11 items-center underline-offset-4'
                    )}
                  >
                    {PLATFORM_LABELS[link.platform]()}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {musilogy?.releases && musilogy.releases.length > 0 ? (
          <ReleasesSection releases={musilogy.releases} />
        ) : null}

        {kept.length > 0 ? (
          <Section id="kept" title={m.artist_kept_title()}>
            <ol className="m-0 list-none p-0">
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
        ) : null}

        {musilogy ? <MusilogySections artist={musilogy} thisYear={thisYear} /> : null}
      </div>
    </>
  );
}

/**
 * An artist heard on the antenna, on one page, in the order of docs/vision.md §2.4: who they are,
 * where to hear more, their albums and EPs, what the listener kept of them, then where to go next
 * (their place in time, the influences they declared, their bands and their members' projects),
 * each section only when it has something.
 */
export function ArtistPageView({
  state,
  kept = [],
  musilogy = null,
  trail = [],
  thisYear = new Date().getFullYear(),
}: {
  state: ArtistPageState;
  kept?: readonly KeptTrack[];
  musilogy?: MusilogyArtist | null;
  /** The artists walked through to reach this one. */
  trail?: readonly TrailStep[];
  /** Where an active artist's span ends on the map. */
  thisYear?: number;
}) {
  return (
    <main
      id="main"
      className={cn(
        'flex-1',
        (state.status === 'missing' || state.status === 'error') && 'flex flex-col'
      )}
    >
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
        <Profile
          profile={state.profile}
          kept={kept}
          musilogy={musilogy}
          trail={trail}
          thisYear={thisYear}
        />
      )}
    </main>
  );
}
