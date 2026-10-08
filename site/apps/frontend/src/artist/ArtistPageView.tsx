import type {
  ArtistFacts,
  ArtistPlatform,
  ArtistProfile,
  ArtistSummary,
  ClientLikedTrack,
  MusilogyArtist,
} from '@aubesonore/shared-types/client';
import { getLocale } from '@/paraglide/runtime.js';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Cover } from '../home/Cover';
import { ARTIST_LINK } from '../home/styles';
import * as m from '@/paraglide/messages.js';
import { KIND_LABELS } from '../lib/artistKind';
import { SiteHeader } from '../home/SiteHeader';
import { Section } from '../design/molecules/Section';
import { musilogyNav, MusilogySections } from '../musilogy/MusilogyView';
import { PageNav } from '../design/molecules/PageNav';
import { DiscoveryTrail } from '../design/molecules/DiscoveryTrail';
import { PageMessage } from './PageMessage';
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

/** A page with nothing to show, like the 404: what happened, and the way back to the live. */
const OUTSIDE_LINK = { rel: 'noopener noreferrer', target: '_blank' } as const;

/** The opening of the article, its link closing the paragraph rather than taking a line. */
function Summary({ summary }: { summary: ArtistSummary }) {
  return (
    <figure className="text-intro m-0 max-w-prose">
      <blockquote cite={summary.url} lang={summary.lang} className="m-0 inline">
        <p className="m-0 inline">{summary.text}</p>
      </blockquote>{' '}
      <figcaption className="inline">
        <a
          href={summary.url}
          {...OUTSIDE_LINK}
          className={cn(ARTIST_LINK, 'text-ui text-text-muted underline-offset-4')}
        >
          {summary.lang === getLocale()
            ? m.artist_summary_source()
            : m.artist_summary_source_other()}
        </a>
      </figcaption>
    </figure>
  );
}

// An action that leaves the site: a pill, so it reads apart from the text and the page's anchors.
const LISTEN_PILL =
  'text-ui bg-surface-raised ease-out-quart hover:bg-accent/10 focus-visible:outline-accent inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-97';

/** Where else to hear the artist: one pill per platform, each opening outside. */
function ListenLinks({ links }: { links: ArtistProfile['links'] }) {
  return (
    <>
      {/* Named for those who move by headings; the pills say it to the eye. */}
      <h2 id="listen-title" className="sr-only">
        {m.artist_listen_title()}
      </h2>
      {/* One row on phones, scrolling sideways past the gutter like PageNav; wraps from md. */}
      <ul
        aria-labelledby="listen-title"
        className="m-0 -mx-6 flex scrollbar-none list-none gap-2 overflow-x-auto p-0 px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        {links.map((link) => (
          <li key={link.url} className="shrink-0">
            <a href={link.url} {...OUTSIDE_LINK} className={LISTEN_PILL}>
              {PLATFORM_LABELS[link.platform]()}
              <ArrowUpRight aria-hidden="true" className="text-text-muted size-4" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

// MusicBrainz's genres, the most voted first: three say the music, more read as a tag cloud.
const GENRES_SHOWN = 3;

function Portrait({ text }: { text: string }) {
  return <p className="text-intro m-0 max-w-prose">{text}</p>;
}

type KeptTrack = Pick<ClientLikedTrack, 'id' | 'title' | 'album' | 'createdAt'>;

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
  const genres = musilogy?.card.genres.slice(0, GENRES_SHOWN) ?? [];
  const sections = [
    ...(kept.length > 0 ? [{ id: 'kept', label: m.artist_kept_title() }] : []),
    ...(musilogy?.releases && musilogy.releases.length > 0
      ? [{ id: 'records', label: m.artist_records_title() }]
      : []),
    ...(musilogy ? musilogyNav(musilogy) : []),
  ];

  return (
    <>
      {/* The sections' 4/8 grid: the portrait in the title column, who they are beside it. */}
      <div className="px-page wide:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] wide:gap-16 grid gap-6 pt-10 md:pt-16">
        <Cover
          src={profile.image}
          alt={m.artist_portrait_alt({ name: profile.name })}
          seed={profile.name}
          priority
          // w-40 on phones, w-64 on upright tablets; the 4/12 title column where it is wide.
          sizes="(min-width: 64rem) 33vw, (min-width: 48rem) and (orientation: landscape) 33vw, (min-width: 48rem) 16rem, 10rem"
          className="lift-in wide:w-full aspect-square w-40 md:w-64"
        />
        {/* Who first, in three lines: what they are, their name, their music; then a few words,
            where to hear them, and the way down the page. */}
        <div className="lift-in-late wide:justify-end flex min-w-0 flex-col">
          <DiscoveryTrail steps={trail} />
          {facts ? (
            <p className="text-label text-text-muted m-0 font-mono uppercase">{facts}</p>
          ) : null}
          <h1 className="text-hero m-0 mt-2 break-words">{profile.name}</h1>
          {genres.length > 0 ? <p className="text-sub m-0 mt-3">{genres.join(' · ')}</p> : null}
          {profile.summary || portrait ? (
            <div className="mt-6">
              {profile.summary ? <Summary summary={profile.summary} /> : null}
              {portrait ? <Portrait text={portrait} /> : null}
            </div>
          ) : null}
          {profile.links.length > 0 ? (
            <div className="mt-6">
              <ListenLinks links={profile.links} />
            </div>
          ) : null}
          {sections.length > 1 ? (
            <div className="border-border mt-8 border-t pt-2">
              <PageNav items={sections} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-page flex flex-col gap-16 py-16 md:gap-28 md:py-28">
        {kept.length > 0 ? (
          <Section id="kept" title={m.artist_kept_title()}>
            <ol className="m-0 list-none p-0">
              {kept.map((track) => (
                <li
                  key={track.id}
                  className="border-border reveal grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b py-2 md:px-1"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-row truncate">{track.title}</span>
                    {track.album ? (
                      <span className="text-ui text-text-muted truncate">{track.album}</span>
                    ) : null}
                  </span>
                  <span className="text-ui text-text-muted font-mono whitespace-nowrap tabular-nums">
                    {formatKeptAt(track.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {musilogy?.releases && musilogy.releases.length > 0 ? (
          <ReleasesSection releases={musilogy.releases} />
        ) : null}

        {musilogy ? <MusilogySections artist={musilogy} thisYear={thisYear} /> : null}
      </div>
    </>
  );
}

/**
 * An artist heard on the antenna, on one page, in the order of docs/vision.md §2.4: who they are,
 * where to hear more, their albums and EPs, what the listener kept of them, then where to go next
 * (their place in time, their bands and their members' projects),
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
        <PageMessage title={m.artist_missing_title()} body={m.artist_missing_body()} />
      ) : state.status === 'error' ? (
        <PageMessage title={m.artist_error_title()} body={m.artist_error_body()} />
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
