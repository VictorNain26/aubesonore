import { useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router';
import { Search, X } from 'lucide-react';
import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogyBandmate,
  MusilogyOtherName,
  MusilogyProject,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { KIND_LABELS } from '../lib/artistKind';
import type { PageNavItem } from '../design/molecules/PageNav';
import { Section } from '../design/molecules/Section';
import { ARTIST_LINK, TEXT_ACTION } from '../home/styles';
import { cn } from '@/lib/utils';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';
import { closeArtistsOf, MusilogyTimeline, timelineNote } from './MusilogyTimeline';

// A list shows its closest first; the rest opens on demand.
const FIRST_SHOWN = 12;
const PROJECTS_SHOWN = 8;

const NAME_KINDS: Record<MusilogyOtherName['kind'], () => string> = {
  alias: () => m.musilogy_name_alias(),
  person: () => m.musilogy_name_person(),
  former: () => m.musilogy_name_former(),
  later: () => m.musilogy_name_later(),
};

// A row's link covers the whole row, the years and the line under the name included: a phone gets a
// 56 px target instead of the name's 21 px. The row is the link's positioned ancestor.
const STRETCHED = "after:absolute after:inset-0 after:content-['']";

/** Years in a group: "de 1971 à 1975", "1971" within one year, "depuis 1971" or "jusqu'en 1975". */
export function linkYears(link: Pick<MusilogyBandmate, 'yBegin' | 'yEnd'>): string | null {
  if (link.yBegin && link.yBegin === link.yEnd) return String(link.yBegin);
  if (link.yBegin && link.yEnd)
    return m.years_range({ from: String(link.yBegin), to: String(link.yEnd) });
  if (link.yBegin) return m.artist_since({ year: String(link.yBegin) });
  if (link.yEnd) return m.musilogy_until({ year: String(link.yEnd) });
  return null;
}

/** « Voir N de plus », for a list folded past its first names. */
function ShowMore({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={TEXT_ACTION}>
      {m.musilogy_show_more({ count: String(count) })}
    </button>
  );
}

/**
 * The other groups of a member, on one line under its name: Discogs' « In Groups », RYM's « Member
 * of ». Each name is a 44 px target; past the first eight (99 % of the dump's musicians are in at
 * most seven groups, 2026-10-12), the rest open on demand.
 */
function AlsoIn({ projects }: { projects: readonly MusilogyProject[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? projects : projects.slice(0, PROJECTS_SHOWN);
  return (
    <div className="text-ui text-text-muted flex flex-wrap items-start gap-x-1.5">
      <span>{m.musilogy_also_in()}</span>
      <ul className="m-0 flex min-w-0 list-none flex-wrap items-start p-0">
        {shown.map((project, i) => (
          <li key={project.mbid} className="inline-flex items-start">
            <Link
              to={pagePathOf(project)}
              state={DISCOVERY}
              // The text at the top of its 44 px target, close to the name above it.
              className={cn(ARTIST_LINK, 'text-text flex min-h-11 items-start underline-offset-4')}
            >
              {project.name}
            </Link>
            {i < shown.length - 1 ? <span className="pr-1.5">,</span> : null}
          </li>
        ))}
        {projects.length > shown.length ? (
          <li className="inline-flex items-start pl-3">
            <ShowMore count={projects.length - shown.length} onOpen={() => setOpen(true)} />
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** A member with its years, MusicBrainz's line on who it is, and the other groups it leads to. */
function MemberRow({
  member,
  projects,
}: {
  member: MusilogyBandmate;
  projects: readonly MusilogyProject[];
}) {
  const years = linkYears(member);
  // With a line under it, the name sits at the foot of its 44 px target, close to that line.
  const below = member.disambiguation || projects.length > 0;
  return (
    <li className="border-border reveal flex min-h-14 flex-col justify-center border-b py-1 md:px-1">
      <span className={cn('flex justify-between gap-6', below ? 'items-end' : 'items-center')}>
        <Link
          to={pagePathOf(member)}
          state={DISCOVERY}
          className={cn(
            ARTIST_LINK,
            'text-row flex min-h-11 underline-offset-4',
            below ? 'items-end' : 'items-center'
          )}
        >
          {member.name}
        </Link>
        {years ? (
          <span className="text-ui text-text-muted font-mono whitespace-nowrap tabular-nums">
            {years}
          </span>
        ) : null}
      </span>
      {member.disambiguation ? (
        <span className="text-ui text-text-muted truncate">{member.disambiguation}</span>
      ) : null}
      {projects.length > 0 ? <AlsoIn projects={projects} /> : null}
    </li>
  );
}

/**
 * Each member's projects, by the names musilogy gives as `via` (artist_member_projects), which come
 * from the same links and names as the members (artist_bands). A name two members share leads to
 * no one: their projects stay loose, said with the names that lead there (168 of 205 606 groups,
 * 2026-10-12).
 */
function tieProjects(
  members: readonly MusilogyBandmate[],
  projects: readonly MusilogyProject[]
): { byMember: Map<string, MusilogyProject[]>; loose: MusilogyProject[] } {
  const names = members.map((member) => member.name);
  const shared = new Set(names.filter((name, i) => names.indexOf(name) !== i));
  const byMember = new Map(
    members.map((member) => [
      member.mbid,
      shared.has(member.name) ? [] : projects.filter((p) => p.via.includes(member.name)),
    ])
  );
  const loose = projects.filter((p) => p.via.every((name) => shared.has(name)));
  return { byMember, loose };
}

/**
 * The members, the earliest first, each with the other groups it leads to: the reference works
 * (Discogs, RYM, AllMusic) tie a member's groups to the member, never list them apart.
 */
function Members({
  members,
  byMember,
}: {
  members: readonly MusilogyBandmate[];
  byMember: Map<string, MusilogyProject[]>;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? members : members.slice(0, FIRST_SHOWN);
  return (
    <>
      <ol className="m-0 list-none p-0">
        {shown.map((member) => (
          <MemberRow key={member.mbid} member={member} projects={byMember.get(member.mbid) ?? []} />
        ))}
      </ol>
      {members.length > shown.length ? (
        <span className="self-start pt-1">
          <ShowMore count={members.length - shown.length} onOpen={() => setOpen(true)} />
        </span>
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

/** Names on one line, each with a word on what it is: other names, a person's groups. */
function InlineArtists<T extends MusilogyArtistRef>({
  artists,
  noteOf,
  limit = Infinity,
}: {
  artists: readonly T[];
  noteOf: (artist: T) => string | null;
  /** How many show before « Voir N de plus ». */
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? artists : artists.slice(0, limit);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
      {shown.map((artist) => {
        const note = noteOf(artist);
        return (
          <li key={artist.mbid} className="reveal inline-flex min-h-11 items-baseline gap-2">
            <Link
              to={pagePathOf(artist)}
              state={DISCOVERY}
              className={cn(ARTIST_LINK, 'text-row underline-offset-4')}
            >
              {artist.name}
            </Link>
            {note ? <span className="text-ui text-text-muted">{note}</span> : null}
          </li>
        );
      })}
      {artists.length > shown.length ? (
        <li className="inline-flex items-center">
          <ShowMore count={artists.length - shown.length} onOpen={() => setOpen(true)} />
        </li>
      ) : null}
    </ul>
  );
}

/**
 * Members, each with its other groups, or a person's groups; then other names (docs/vision.md
 * §2.4), rather than MusicBrainz's dozen relation types.
 */
function Bands({ artist }: { artist: MusilogyArtist }) {
  const { bands, memberProjects, otherNames } = artist;
  const { byMember, loose } = tieProjects(bands?.members ?? [], memberProjects ?? []);
  return (
    <div className="flex flex-col gap-8">
      {bands && bands.members.length > 0 ? (
        <SubList label={m.musilogy_members()}>
          <Members members={bands.members} byMember={byMember} />
        </SubList>
      ) : null}
      {loose.length > 0 ? (
        <SubList label={m.musilogy_member_projects()}>
          <InlineArtists
            artists={loose}
            noteOf={(project) => m.musilogy_via({ names: project.via.join(', ') })}
          />
        </SubList>
      ) : null}
      {bands && bands.groups.length > 0 ? (
        // A person's bands; for a group, the projects it took part in (Stereolab in Uilab).
        <SubList
          label={artist.card.kind === 'person' ? m.musilogy_groups() : m.musilogy_joint_projects()}
        >
          <InlineArtists artists={bands.groups} noteOf={linkYears} limit={FIRST_SHOWN} />
        </SubList>
      ) : null}
      {otherNames && otherNames.length > 0 ? (
        <SubList label={m.musilogy_other_names()}>
          <InlineArtists artists={otherNames} noteOf={(name) => NAME_KINDS[name.kind]()} />
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

/** The sections MusilogySections shows, for the page's anchors (PageNav). */
export function musilogyNav(artist: MusilogyArtist): PageNavItem[] {
  const close = closeArtistsOf(artist).length > 0;
  return [
    close ? { id: 'close', label: m.musilogy_close_title() } : null,
    bandCount(artist) > 0 ? { id: 'bands', label: m.musilogy_links_title() } : null,
  ].filter((item) => item !== null);
}

/**
 * Where to go next from an artist: its close artists, the closest first, their years drawn on one
 * axis; then the bands and their projects. A section with nothing in it is left out: no « nothing
 * yet » under a title.
 */
export function MusilogySections({
  artist,
  thisYear,
}: {
  artist: MusilogyArtist;
  thisYear: number;
}) {
  const close = closeArtistsOf(artist).length > 0;
  return (
    <>
      {close ? (
        <Section
          id="close"
          title={m.musilogy_close_title()}
          body={timelineNote(artist, thisYear)}
          sticky
        >
          <MusilogyTimeline artist={artist} thisYear={thisYear} />
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
  /** `hits`: the last answer, kept on screen while the next one comes. */
  | { status: 'searching'; hits: MusilogySearchHit[] }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'done'; hits: MusilogySearchHit[] };

// Name and what tells it apart, then on a wide screen the kind and the first year in columns.
const HIT_COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 md:grid-cols-[minmax(0,1fr)_9rem_5rem]';

function SearchHitRow({ hit }: { hit: MusilogySearchHit }) {
  const kind = hit.kind ? KIND_LABELS[hit.kind]() : null;
  return (
    <li
      className={cn(
        HIT_COLUMNS,
        'border-border reveal relative min-h-18 border-b py-2.5 focus-within:animate-none'
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <Link
          to={pagePathOf({ ...hit, played: null })}
          state={DISCOVERY}
          className={cn(ARTIST_LINK, STRETCHED, 'text-row self-start truncate underline-offset-4')}
        >
          {hit.name}
        </Link>
        {hit.disambiguation || kind ? (
          <span className="text-sub text-text-muted truncate">
            {/* The kind has its own column on a wide screen. */}
            {kind ? (
              <span className="md:hidden">
                {kind}
                {hit.disambiguation ? ' · ' : null}
              </span>
            ) : null}
            {hit.disambiguation}
          </span>
        ) : null}
      </span>
      <span className="text-sub text-text-muted hidden md:block">{kind}</span>
      <span className="text-ui text-text-muted font-mono whitespace-nowrap tabular-nums md:justify-self-start">
        {hit.y0 ?? null}
      </span>
    </li>
  );
}

function HitsSkeleton() {
  return (
    <ol aria-busy="true" className="m-0 list-none p-0">
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className="border-border flex min-h-18 flex-col justify-center gap-2 border-b py-2.5"
        >
          <span className="bg-surface-raised h-4 w-1/3 rounded-sm" />
          <span className="bg-surface-raised h-3 w-1/2 rounded-sm" />
        </li>
      ))}
    </ol>
  );
}

function SearchHits({ hits, stale }: { hits: MusilogySearchHit[]; stale: boolean }) {
  return (
    <div className={cn('ease-out-quart transition-opacity duration-150', stale && 'opacity-50')}>
      <div
        aria-hidden="true"
        className={cn(
          HIT_COLUMNS,
          'border-border text-label text-text-muted hidden border-b pb-3 font-mono uppercase md:grid'
        )}
      >
        <span>{m.musilogy_col_artist()}</span>
        <span>{m.musilogy_col_kind()}</span>
        <span>{m.musilogy_col_start()}</span>
      </div>
      <ol className="m-0 list-none p-0">
        {hits.map((hit) => (
          <SearchHitRow key={hit.mbid} hit={hit} />
        ))}
      </ol>
    </div>
  );
}

// Less visual viewport than layout viewport by this much: an on-screen keyboard covers the page
// (a desktop or a hardware keyboard never does). The margin absorbs iOS 26.0, whose visual
// viewport stays ~24 px short after the keyboard closes (https://bugs.webkit.org/show_bug.cgi?id=297779).
const KEYBOARD_MIN = 100;

/** Musilogy's entry: what it is, and a search for any artist, its answers in columns. */
export function MusilogyHomeView({
  query,
  onQueryChange,
  search,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  search: SearchState;
}) {
  const searchRef = useRef<HTMLDivElement>(null);
  const liftedThisFocus = useRef(false);
  const [lifted, setLifted] = useState(false);

  // On a phone the keyboard hides the answers under the field: at the first letter of each focus
  // (the keyboard is open by then, Safari's own focus scroll is over), the field goes to the top.
  const liftAboveKeyboard = () => {
    if (liftedThisFocus.current) return;
    liftedThisFocus.current = true;
    const viewport = window.visualViewport;
    if (!viewport || window.innerHeight - viewport.height < KEYBOARD_MIN) return;
    // The answers hold a screen's height, or a short page could not scroll the field that far.
    flushSync(() => setLifted(true));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    searchRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <main
      id="main"
      className="lift-in px-page flex flex-1 flex-col gap-10 pt-10 pb-16 md:gap-14 md:pt-16 md:pb-24"
    >
      <div className="grid gap-5 md:grid-cols-2 md:items-end md:gap-16">
        <h1 className="text-hero m-0">{m.musilogy_title()}</h1>
        <p className="text-intro text-text-muted max-w-aside m-0 md:pb-2">{m.musilogy_lead()}</p>
      </div>

      <div className="flex flex-col gap-8">
        <div ref={searchRef} role="search" className="relative w-full max-w-2xl scroll-mt-4">
          <label>
            <span className="sr-only">{m.musilogy_search_label()}</span>
            <Search
              className="text-text-muted pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                onQueryChange(event.target.value);
                liftAboveKeyboard();
              }}
              onFocus={() => {
                liftedThisFocus.current = false;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onQueryChange('');
              }}
              placeholder={m.musilogy_search_placeholder()}
              autoComplete="off"
              className={cn(
                'text-row border-accent ease-out-quart placeholder:text-text-faint hover:bg-surface-raised focus-visible:outline-accent h-14 w-full rounded-full border bg-transparent pl-13 font-normal transition-colors duration-150 focus-visible:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-search-cancel-button]:hidden',
                // The clear button's room is kept only while it shows: a phone needs it for the placeholder.
                query ? 'pr-14' : 'pr-5'
              )}
            />
          </label>
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label={m.library_search_clear()}
              className="ease-out-quart focus-visible:outline-accent absolute top-1.5 right-1.5 flex size-11 items-center justify-center rounded-full transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90"
            >
              <X className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div aria-live="polite" className={cn(lifted && query && 'min-h-svh')}>
          {search.status === 'idle' ? (
            <p className="text-text-muted m-0">{m.musilogy_search_hint()}</p>
          ) : search.status === 'unavailable' ? (
            <Empty text={m.musilogy_unavailable_body()} />
          ) : search.status === 'error' ? (
            <Empty text={m.musilogy_search_error()} />
          ) : search.status === 'searching' ? (
            search.hits.length > 0 ? (
              <SearchHits hits={search.hits} stale />
            ) : (
              <HitsSkeleton />
            )
          ) : search.hits.length > 0 ? (
            <SearchHits hits={search.hits} stale={false} />
          ) : (
            <Empty text={m.musilogy_search_empty()} />
          )}
        </div>
      </div>
    </main>
  );
}
