import { useState } from 'react';
import { Link } from 'react-router';
import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogyCard,
  MusilogyLink,
  MusilogyLinkKind,
  MusilogyNeighbour,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import { getLocale } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';
import { Section } from '../artist/ArtistPageView';
import { SiteHeader } from '../home/SiteHeader';
import { TEXT_ACTION } from '../home/styles';
import { artistPath } from '../lib/artistProfile';
import { musilogyPath } from '../lib/musilogy';
import { MusilogyMap } from './MusilogyMap';

export type MusilogyState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; artist: MusilogyArtist };

// A list shows its closest first; the rest opens on demand.
const FIRST_SHOWN = 12;

const KIND_LABELS: Record<string, () => string> = {
  Person: () => m.artist_kind_person(),
  Group: () => m.artist_kind_group(),
  Orchestra: () => m.artist_kind_orchestra(),
  Choir: () => m.artist_kind_choir(),
};

const LINK_LABELS: Record<MusilogyLinkKind, () => string> = {
  memberOf: () => m.musilogy_link_member_of(),
  members: () => m.musilogy_link_members(),
  founded: () => m.musilogy_link_founded(),
  foundedBy: () => m.musilogy_link_founded_by(),
  subgroupOf: () => m.musilogy_link_subgroup_of(),
  subgroups: () => m.musilogy_link_subgroups(),
  renamedTo: () => m.musilogy_link_renamed_to(),
  renamedFrom: () => m.musilogy_link_renamed_from(),
  aliasOf: () => m.musilogy_link_alias_of(),
  aliases: () => m.musilogy_link_aliases(),
  collaboratedIn: () => m.musilogy_link_collaborated_in(),
  collaborators: () => m.musilogy_link_collaborators(),
};

const LINK_ORDER: MusilogyLinkKind[] = [
  'members',
  'memberOf',
  'foundedBy',
  'founded',
  'renamedFrom',
  'renamedTo',
  'subgroupOf',
  'subgroups',
  'aliasOf',
  'aliases',
  'collaborators',
  'collaboratedIn',
];

/** "Groupe · Royaume-Uni · 1967 – 1977": what MusicBrainz states, nothing more. */
export function cardLine(card: MusilogyCard): string {
  const kind = KIND_LABELS[card.type]?.() ?? '';
  const country = card.country
    ? new Intl.DisplayNames([getLocale()], { type: 'region' }).of(card.country)
    : '';
  const where = [card.beginArea, country].filter(Boolean).join(', ');
  // A start read from the first album says so; an end is shown only when
  // declared: a last album is not the end of a band still active.
  const end = card.yEnd && card.yEndSource === 'declared' ? String(card.yEnd) : null;
  const when = !card.y0
    ? ''
    : card.y0Source === 'first_album'
      ? [
          m.musilogy_first_album({ year: String(card.y0) }),
          end ? m.musilogy_until({ year: end }) : '',
        ]
          .filter(Boolean)
          .join(', ')
      : end
        ? m.years_range({ from: String(card.y0), to: end })
        : String(card.y0);
  return [kind, where, when].filter(Boolean).join(' · ');
}

function ArtistRow({ artist, years }: { artist: MusilogyArtistRef; years?: string | null }) {
  const when = years === undefined ? (artist.y0 ? String(artist.y0) : null) : years;
  return (
    <li className="border-border reveal grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b py-2 md:px-1">
      <span className="flex min-w-0 flex-col">
        <Link to={musilogyPath(artist)} className={`${TEXT_ACTION} text-row truncate`}>
          {artist.name}
        </Link>
        {artist.disambiguation ? (
          <span className="text-ui text-text-muted truncate">{artist.disambiguation}</span>
        ) : null}
        {artist.played ? (
          <Link
            to={artistPath(artist.played)}
            className={`${TEXT_ACTION} text-label self-start font-mono uppercase`}
          >
            {m.musilogy_played()}
          </Link>
        ) : null}
      </span>
      <span className="flex items-center">
        {when ? (
          <span className="text-ui text-text-muted font-mono whitespace-nowrap tabular-nums">
            {when}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** A link's years in the group: "de 1971 à 1975", "depuis 1971" or "jusqu'en 1975". */
export function linkYears(link: MusilogyLink): string | null {
  if (link.yBegin && link.yEnd)
    return m.years_range({ from: String(link.yBegin), to: String(link.yEnd) });
  if (link.yBegin) return m.artist_since({ year: String(link.yBegin) });
  if (link.yEnd) return m.musilogy_until({ year: String(link.yEnd) });
  return null;
}

function ArtistList<T extends MusilogyArtistRef>({
  artists,
  yearsOf,
}: {
  artists: readonly T[];
  yearsOf?: (artist: T) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? artists : artists.slice(0, FIRST_SHOWN);
  return (
    <>
      <ol className="border-accent m-0 list-none border-t p-0">
        {shown.map((artist) => (
          <ArtistRow
            key={artist.mbid}
            artist={artist}
            {...(yearsOf ? { years: yearsOf(artist) } : {})}
          />
        ))}
      </ol>
      {artists.length > shown.length ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${TEXT_ACTION} self-start pt-3`}
        >
          {m.musilogy_show_more({ count: String(artists.length - shown.length) })}
        </button>
      ) : null}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-text-muted border-accent m-0 border-t pt-4">{text}</p>;
}

function NeighbourSection({
  id,
  title,
  body,
  neighbours,
  surveyed,
}: {
  id: string;
  title: string;
  body: string;
  neighbours: readonly MusilogyNeighbour[] | null;
  /** False when the snapshot never asked about this artist: no neighbour, for want of asking. */
  surveyed: boolean | null;
}) {
  return (
    <Section id={id} title={title} body={body}>
      {neighbours === null ? (
        <Empty text={m.musilogy_neighbours_pending()} />
      ) : neighbours.length > 0 ? (
        <ArtistList artists={neighbours} />
      ) : (
        <Empty
          text={
            surveyed === false ? m.musilogy_neighbours_unsurveyed() : m.musilogy_neighbours_empty()
          }
        />
      )}
    </Section>
  );
}

function Links({ links }: { links: readonly MusilogyLink[] }) {
  const byKind = LINK_ORDER.map((kind) => [kind, links.filter((l) => l.kind === kind)] as const);
  return (
    <div className="flex flex-col gap-8">
      {byKind
        .filter(([, list]) => list.length > 0)
        .map(([kind, list]) => (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="text-label text-text-muted m-0 font-mono uppercase">
              {LINK_LABELS[kind]()}
            </h3>
            <ArtistList artists={list} yearsOf={linkYears} />
          </div>
        ))}
    </div>
  );
}

function ArtistView({ artist, thisYear }: { artist: MusilogyArtist; thisYear: number }) {
  const { card, neighbours, influences, links } = artist;
  const line = cardLine(card);
  return (
    <>
      <div className="lift-in px-page flex flex-col gap-4 pt-10 md:pt-16">
        <p className="text-label text-text-muted m-0 font-mono uppercase">{m.musilogy_title()}</p>
        <h1 className="text-hero m-0 break-words">{card.name}</h1>
        {card.disambiguation ? (
          <p className="text-sub text-text-muted m-0">{card.disambiguation}</p>
        ) : null}
        {line ? <p className="text-sub m-0">{line}</p> : null}
        {card.genres.length > 0 ? (
          <p className="text-ui text-text-muted m-0">{card.genres.slice(0, 6).join(' · ')}</p>
        ) : null}
        {card.played ? (
          <Link to={artistPath(card.played)} className={`${TEXT_ACTION} self-start`}>
            {m.musilogy_played_page()}
          </Link>
        ) : null}
      </div>

      <div className="px-page flex flex-col gap-16 py-12 md:gap-28 md:py-20">
        <div className="flex flex-col gap-6">
          <p className="text-intro text-text-muted m-0 max-w-prose">
            {m.musilogy_neighbours_note()}
          </p>
          <MusilogyMap artist={artist} thisYear={thisYear} />
        </div>
        <NeighbourSection
          id="before"
          title={m.musilogy_before_title()}
          body={m.musilogy_before_body()}
          neighbours={neighbours?.before ?? null}
          surveyed={card.proximitySurveyed}
        />
        <NeighbourSection
          id="during"
          title={m.musilogy_during_title()}
          body={m.musilogy_during_body()}
          neighbours={neighbours?.during ?? null}
          surveyed={card.proximitySurveyed}
        />
        <NeighbourSection
          id="after"
          title={m.musilogy_after_title()}
          body={m.musilogy_after_body()}
          neighbours={neighbours?.after ?? null}
          surveyed={card.proximitySurveyed}
        />
        {neighbours && neighbours.undated.length > 0 ? (
          <Section id="undated" title={m.musilogy_undated_title()} body={m.musilogy_undated_body()}>
            <ArtistList artists={neighbours.undated} />
          </Section>
        ) : null}

        <Section
          id="influences"
          title={m.musilogy_influences_title()}
          body={m.musilogy_influences_body()}
        >
          {influences === null ? (
            <Empty text={m.musilogy_influences_pending()} />
          ) : influences.cites.length + influences.citedBy.length === 0 ? (
            <Empty text={m.musilogy_influences_empty()} />
          ) : (
            <div className="flex flex-col gap-8">
              {(
                [
                  [m.musilogy_cites(), influences.cites],
                  [m.musilogy_cited_by(), influences.citedBy],
                ] as const
              )
                .filter(([, list]) => list.length > 0)
                .map(([label, list]) => (
                  <div key={label} className="flex flex-col gap-2">
                    <h3 className="text-label text-text-muted m-0 font-mono uppercase">{label}</h3>
                    <ArtistList artists={list} />
                  </div>
                ))}
            </div>
          )}
        </Section>

        {links.length > 0 ? (
          <Section id="links" title={m.musilogy_links_title()} body={m.musilogy_links_body()}>
            <Links links={links} />
          </Section>
        ) : null}
      </div>
    </>
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

/** An artist's place in the history of its music: before, alongside, after, and its bands. */
export function MusilogyArtistView({
  state,
  thisYear = new Date().getFullYear(),
}: {
  state: MusilogyState;
  /** Where an active artist's span ends on the map. */
  thisYear?: number;
}) {
  return (
    <main id="main" className="min-h-dvh">
      <SiteHeader />
      {state.status === 'loading' ? (
        <div aria-busy="true" className="px-page flex flex-col gap-6 pt-10 md:pt-16">
          <span className="bg-surface-raised h-12 w-2/3 rounded-sm" />
          <span className="bg-surface-raised h-6 w-1/3 rounded-sm" />
        </div>
      ) : state.status === 'missing' ? (
        <Message title={m.musilogy_missing_title()} body={m.musilogy_missing_body()} />
      ) : state.status === 'unavailable' ? (
        <Message title={m.musilogy_unavailable_title()} body={m.musilogy_unavailable_body()} />
      ) : state.status === 'error' ? (
        <Message title={m.musilogy_error_title()} body={m.musilogy_error_body()} />
      ) : (
        <ArtistView artist={state.artist} thisYear={thisYear} />
      )}
    </main>
  );
}

export type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'done'; hits: MusilogySearchHit[] };

/** Musilogy's entry: what it is, and a search for any artist. */
export function MusilogyHomeView({
  query,
  onQueryChange,
  search,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  search: SearchState;
}) {
  return (
    <main id="main" className="min-h-dvh">
      <SiteHeader />
      <div className="lift-in px-page flex flex-col gap-6 pt-10 pb-24 md:pt-16">
        <h1 className="text-hero m-0">{m.musilogy_title()}</h1>
        <p className="text-intro text-text-muted max-w-blurb m-0">{m.musilogy_lead()}</p>
        <label className="flex max-w-xl flex-col gap-2">
          <span className="text-label text-text-muted font-mono uppercase">
            {m.musilogy_search_label()}
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={m.musilogy_search_placeholder()}
            autoComplete="off"
            className="border-accent text-row focus-visible:outline-accent min-h-11 rounded-sm border bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <div aria-live="polite" className="max-w-xl">
          {search.status === 'unavailable' ? (
            <Empty text={m.musilogy_unavailable_body()} />
          ) : search.status === 'error' ? (
            <Empty text={m.musilogy_search_error()} />
          ) : search.status === 'done' ? (
            search.hits.length > 0 ? (
              <ol className="border-accent m-0 list-none border-t p-0">
                {search.hits.map((hit) => (
                  <ArtistRow key={hit.mbid} artist={{ ...hit, played: null }} />
                ))}
              </ol>
            ) : (
              <Empty text={m.musilogy_search_empty()} />
            )
          ) : null}
        </div>
      </div>
    </main>
  );
}
