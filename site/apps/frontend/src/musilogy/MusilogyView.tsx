import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogyBandmate,
  MusilogyOtherName,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import type { PageNavItem } from '../design/molecules/PageNav';
import { Section } from '../design/molecules/Section';
import { SiteHeader } from '../home/SiteHeader';
import { ARTIST_LINK, TEXT_ACTION } from '../home/styles';
import { cn } from '@/lib/utils';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';
import { MusilogyMap } from './MusilogyMap';

// A list shows its closest first; the rest opens on demand.
const FIRST_SHOWN = 12;

const NAME_KINDS: Record<MusilogyOtherName['kind'], () => string> = {
  alias: () => m.musilogy_name_alias(),
  person: () => m.musilogy_name_person(),
  former: () => m.musilogy_name_former(),
  later: () => m.musilogy_name_later(),
};

function ArtistRow({
  artist,
  years,
  detail,
}: {
  artist: MusilogyArtistRef;
  years?: string | null;
  /** The line under the name; MusicBrainz's disambiguation by default. */
  detail?: string | null;
}) {
  const when = years === undefined ? (artist.y0 ? String(artist.y0) : null) : years;
  const under = detail === undefined ? artist.disambiguation : detail;
  return (
    <li className="border-border reveal grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b py-2 md:px-1">
      <span className="flex min-w-0 flex-col">
        <Link
          to={pagePathOf(artist)}
          state={DISCOVERY}
          className={cn(ARTIST_LINK, 'text-row self-start truncate underline-offset-4')}
        >
          {artist.name}
        </Link>
        {under ? <span className="text-ui text-text-muted truncate">{under}</span> : null}
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

/** Years in a group: "de 1971 à 1975", "depuis 1971" or "jusqu'en 1975". */
export function linkYears(link: Pick<MusilogyBandmate, 'yBegin' | 'yEnd'>): string | null {
  if (link.yBegin && link.yEnd)
    return m.years_range({ from: String(link.yBegin), to: String(link.yEnd) });
  if (link.yBegin) return m.artist_since({ year: String(link.yBegin) });
  if (link.yEnd) return m.musilogy_until({ year: String(link.yEnd) });
  return null;
}

function ArtistList<T extends MusilogyArtistRef>({
  artists,
  yearsOf,
  detailOf,
}: {
  artists: readonly T[];
  yearsOf?: (artist: T) => string | null;
  detailOf?: (artist: T) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? artists : artists.slice(0, FIRST_SHOWN);
  return (
    <>
      <ol className="m-0 list-none p-0">
        {shown.map((artist) => (
          <ArtistRow
            key={artist.mbid}
            artist={artist}
            {...(yearsOf ? { years: yearsOf(artist) } : {})}
            {...(detailOf ? { detail: detailOf(artist) } : {})}
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
  return <p className="text-text-muted m-0">{text}</p>;
}

function SubList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-ui text-text-muted m-0 font-normal">{label}</h3>
      {children}
    </div>
  );
}

/** Other names on one line, each with what it is to the artist. */
function OtherNames({ names }: { names: readonly MusilogyOtherName[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
      {names.map((name) => (
        <li key={name.mbid} className="reveal inline-flex min-h-11 items-baseline gap-2">
          <Link
            to={pagePathOf(name)}
            state={DISCOVERY}
            className={cn(ARTIST_LINK, 'text-row underline-offset-4')}
          >
            {name.name}
          </Link>
          <span className="text-ui text-text-muted">{NAME_KINDS[name.kind]()}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Members or bands, the members' other projects, other names: three sections
 * rather than MusicBrainz's dozen relation types (docs/vision.md §2.4).
 */
function Bands({ artist }: { artist: MusilogyArtist }) {
  const { bands, memberProjects, otherNames } = artist;
  return (
    <div className="flex flex-col gap-8">
      {bands && bands.members.length > 0 ? (
        <SubList label={m.musilogy_members()}>
          <ArtistList artists={bands.members} yearsOf={linkYears} />
        </SubList>
      ) : null}
      {bands && bands.groups.length > 0 ? (
        // A person's bands; for a group, the projects it took part in (Stereolab in Uilab).
        <SubList
          label={artist.card.type === 'Person' ? m.musilogy_groups() : m.musilogy_joint_projects()}
        >
          <ArtistList artists={bands.groups} yearsOf={linkYears} />
        </SubList>
      ) : null}
      {memberProjects && memberProjects.length > 0 ? (
        <SubList label={m.musilogy_member_projects()}>
          <ArtistList
            artists={memberProjects}
            detailOf={(project) => m.musilogy_via({ names: project.via.join(', ') })}
          />
        </SubList>
      ) : null}
      {otherNames && otherNames.length > 0 ? (
        <SubList label={m.musilogy_other_names()}>
          <OtherNames names={otherNames} />
        </SubList>
      ) : null}
    </div>
  );
}

function bandCount({ bands, memberProjects, otherNames }: MusilogyArtist): number {
  return (
    (bands ? bands.members.length + bands.groups.length : 0) +
    (memberProjects?.length ?? 0) +
    (otherNames?.length ?? 0)
  );
}

/** The close artists Musilogy holds, by when they started against the artist. */
function closeOf({ neighbours }: MusilogyArtist) {
  return neighbours
    ? (
        [
          [m.musilogy_before_title(), neighbours.before],
          [m.musilogy_during_title(), neighbours.during],
          [m.musilogy_after_title(), neighbours.after],
          [m.musilogy_undated_title(), neighbours.undated],
        ] as const
      ).filter(([, list]) => list.length > 0)
    : [];
}

function citedOf({ influences }: MusilogyArtist) {
  return influences
    ? (
        [
          [m.musilogy_cites(), influences.cites],
          [m.musilogy_cited_by(), influences.citedBy],
        ] as const
      ).filter(([, list]) => list.length > 0)
    : [];
}

/** The sections MusilogySections shows, for the page's anchors (PageNav). */
export function musilogyNav(artist: MusilogyArtist): PageNavItem[] {
  return [
    closeOf(artist).length > 0 ? { id: 'close', label: m.musilogy_close_title() } : null,
    citedOf(artist).length > 0 ? { id: 'influences', label: m.musilogy_influences_title() } : null,
    bandCount(artist) > 0 ? { id: 'bands', label: m.musilogy_links_title() } : null,
  ].filter((item) => item !== null);
}

/**
 * Where to go next from an artist, one section per thing Musilogy holds: the close artists (the
 * map, then before, alongside, after), the influences, the bands and their projects. A section
 * with nothing in it is left out: no « nothing yet » under a title.
 */
export function MusilogySections({
  artist,
  thisYear,
}: {
  artist: MusilogyArtist;
  thisYear: number;
}) {
  const close = closeOf(artist);
  const cited = citedOf(artist);
  return (
    <>
      {close.length > 0 ? (
        <Section
          id="close"
          title={m.musilogy_close_title()}
          body={m.musilogy_neighbours_note()}
          sticky
        >
          <div className="flex flex-col gap-10">
            <MusilogyMap artist={artist} thisYear={thisYear} />
            {close.map(([label, list]) => (
              <SubList key={label} label={label}>
                <ArtistList artists={list} />
              </SubList>
            ))}
          </div>
        </Section>
      ) : null}
      {cited.length > 0 ? (
        <Section id="influences" title={m.musilogy_influences_title()} sticky>
          <div className="flex flex-col gap-8">
            {cited.map(([label, list]) => (
              <SubList key={label} label={label}>
                <ArtistList artists={list} />
              </SubList>
            ))}
          </div>
        </Section>
      ) : null}
      {bandCount(artist) > 0 ? (
        <Section id="bands" title={m.musilogy_links_title()} sticky>
          <Bands artist={artist} />
        </Section>
      ) : null}
    </>
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
        <label className="flex max-w-xl flex-col gap-1.5">
          <span className="text-ui">{m.musilogy_search_label()}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={m.musilogy_search_placeholder()}
            autoComplete="off"
            className="border-accent text-row ease-out-quart placeholder:text-text-faint h-13 rounded-none border-0 border-b bg-transparent px-0 transition-[border-width] duration-150 focus-visible:border-b-2 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <div aria-live="polite" className="max-w-xl">
          {search.status === 'unavailable' ? (
            <Empty text={m.musilogy_unavailable_body()} />
          ) : search.status === 'error' ? (
            <Empty text={m.musilogy_search_error()} />
          ) : search.status === 'done' ? (
            search.hits.length > 0 ? (
              <ol className="m-0 list-none p-0">
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
