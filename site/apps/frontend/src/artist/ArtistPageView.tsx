import type {
  ArtistFacts,
  ArtistPlatform,
  ArtistProfile,
  ArtistSummary,
  ClientLikedTrack,
  MusilogyArtist,
} from '@aubesonore/shared-types/client';
import { getLocale } from '@/paraglide/runtime.js';
import { ExternalIcon } from '../design/icons';
import { cn } from '@/lib/utils';
import { ArtistPortrait } from './ArtistPortrait';
import { ARTIST_LINK } from '../design/classes';
import * as m from '@/paraglide/messages.js';
import { KIND_LABELS } from '../lib/artistKind';
import { SiteHeader } from '../shell/SiteHeader';
import { Section } from '../design/Section';
import { musilogyNav, MusilogySections } from '../musilogy/ArtistSections';
import { PageNav } from '../design/PageNav';
import { DiscoveryTrail } from './DiscoveryTrail';
import { PageMessage } from '../shell/PageMessage';
import type { TrailStep } from '../lib/discoveryTrail';
import { ReleasesSection } from '../musilogy/Releases';
import { termOf } from '../musilogy/MusilogyTimeline';
import { Wave } from '../design/Wave';
import { LineLoader } from '../design/LineLoader';
import { seedOf } from '../design/wave';
import { CoverLight } from '../design/CoverLight';

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

const OUTSIDE_LINK = { rel: 'noopener noreferrer', target: '_blank' } as const;

/** The opening of the article, its link closing the paragraph rather than taking a line. */
function Summary({ summary }: { summary: ArtistSummary }) {
  return (
    <figure className="text-line m-0 max-w-prose">
      <blockquote cite={summary.url} lang={summary.lang} className="m-0 inline">
        <p className="m-0 inline">{summary.text}</p>
      </blockquote>{' '}
      <figcaption className="inline">
        <a
          href={summary.url}
          {...OUTSIDE_LINK}
          className={cn(ARTIST_LINK, 'text-body text-text-muted underline-offset-4')}
        >
          {summary.lang === getLocale()
            ? m.artist_summary_source()
            : m.artist_summary_source_other()}
        </a>
      </figcaption>
    </figure>
  );
}

/**
 * Where else to hear the artist: « Écouter sur », then each platform as a written link, opening
 * outside (↗), as the home writes its links rather than boxing them.
 */
function ListenLinks({ links }: { links: ArtistProfile['links'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5">
      <span id="listen-title" className="text-body text-text-muted font-normal">
        {m.artist_listen_title()}
      </span>
      <ul aria-labelledby="listen-title" className="m-0 flex list-none flex-wrap gap-x-5 p-0">
        {links.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              {...OUTSIDE_LINK}
              className={cn(
                ARTIST_LINK,
                'text-body inline-flex min-h-11 items-center gap-1 font-semibold underline-offset-5'
              )}
            >
              {PLATFORM_LABELS[link.platform]()}
              <ExternalIcon className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Discogs' styles, the most records first: three say the music, more read as a tag cloud.
const STYLES_SHOWN = 3;

function Portrait({ text }: { text: string }) {
  return <p className="text-line m-0 max-w-prose">{text}</p>;
}

/**
 * The artist's own horizon, at the foot of the opening, the portrait resting on it: the site's
 * line, still, drawn by their MBID (else the page's id), so the same artist always gets the same
 * one.
 */
function ArtistHorizon({ seed }: { seed: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="artist-horizon"
      className="artist-stage-horizon relative h-14 md:h-16"
    >
      <Wave
        width={1440}
        height={40}
        amplitude={6}
        seed={seedOf(seed)}
        traces={2}
        className="text-text absolute inset-x-0 bottom-3.5 h-10 w-full"
      />
    </div>
  );
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
  const styles = musilogy?.card.styles.slice(0, STYLES_SHOWN).map(termOf) ?? [];
  const sections = [
    ...(kept.length > 0 ? [{ id: 'kept', label: m.artist_kept_title() }] : []),
    ...(musilogy?.releases && musilogy.releases.length > 0
      ? [{ id: 'records', label: m.artist_records_title() }]
      : []),
    ...(musilogy ? musilogyNav(musilogy) : []),
  ];

  return (
    <>
      {/* The home's stage for an artist (design/tokens.css, artist-stage): the header, the portrait
          on the gutter resting on the artist's horizon, the column beside it standing on its foot,
          the portrait's light behind them all. */}
      <div className="artist-stage">
        <CoverLight art={profile.images[0]?.url} />
        <div className="hero-header">
          <SiteHeader />
        </div>
        {/* Its entrance on a wrapper, apart from the image's own hover and press. */}
        <div className="lift-in artist-stage-portrait portrait-room">
          <ArtistPortrait
            images={profile.images}
            name={profile.name}
            seed={profile.mbid ?? profile.name}
          />
        </div>
        {/* Who first: what they are, their name, their music; then a few words and where to hear
            them. */}
        <div className="lift-in-late artist-stage-column flex flex-col">
          <DiscoveryTrail steps={trail} />
          {facts ? <p className="text-line text-text-muted m-0">{facts}</p> : null}
          {/* The page's largest words, above every page's title: the name, as the title on air. */}
          <h1 className="font-display text-name m-0 mt-3 break-words">{profile.name}</h1>
          {styles.length > 0 ? <p className="text-line m-0 mt-4">{styles.join(' · ')}</p> : null}
          {profile.summary || portrait ? (
            <div className="mt-5 md:mt-6">
              {profile.summary ? <Summary summary={profile.summary} /> : null}
              {portrait ? <Portrait text={portrait} /> : null}
            </div>
          ) : null}
          {profile.links.length > 0 ? (
            <div className="mt-2 md:mt-3">
              <ListenLinks links={profile.links} />
            </div>
          ) : null}
        </div>
        <ArtistHorizon seed={profile.mbid ?? profile.id} />
      </div>

      <div className="px-page flex flex-col gap-12 pt-8 pb-16 md:gap-18 md:pt-14 md:pb-24">
        <PageNav items={sections} />
        {kept.length > 0 ? (
          <Section id="kept" title={m.artist_kept_title()}>
            <ol className="m-0 list-none p-0">
              {kept.map((track) => (
                <li
                  key={track.id}
                  className="reveal wave-rule grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-2 md:px-1"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-line truncate font-semibold">{track.title}</span>
                    {track.album ? (
                      <span className="text-body text-text-muted truncate">{track.album}</span>
                    ) : null}
                  </span>
                  <span className="text-body text-text-muted whitespace-nowrap tabular-nums">
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

        {musilogy ? (
          // Keyed by the artist: the next artist opens on its own first tab, not the last one's.
          <MusilogySections key={musilogy.card.mbid} artist={musilogy} thisYear={thisYear} />
        ) : null}
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
  /** Where an active artist's years end on the close artists' timeline. */
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
      {state.status === 'ready' ? null : <SiteHeader />}
      {state.status === 'loading' ? (
        <LineLoader className="px-page min-h-60 pt-10 md:pt-16" />
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
