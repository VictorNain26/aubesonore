import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogyBandmate,
  MusilogyCredit,
  MusilogyOtherName,
  MusilogyProject,
} from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import type { PageNavItem } from '../design/PageNav';
import { Section } from '../design/Section';
import { Tabs, type Tab } from '../design/Tabs';
import { ARTIST_LINK, TEXT_ACTION } from '../design/classes';
import { cn } from '@/lib/utils';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';
import { MusilogyTimeline, sameSoundNote } from './MusilogyTimeline';

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
          <li key={artist.mbid} className="reveal inline-flex items-baseline gap-2">
            <Link
              to={pagePathOf(artist)}
              state={DISCOVERY}
              className={cn(
                ARTIST_LINK,
                'text-row inline-flex min-h-11 items-center underline-offset-4'
              )}
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

/** « 3 disques »: what an artist credited with the artist shares with it. */
function recordsOf(credit: MusilogyCredit): string {
  return credit.records === 1
    ? m.musilogy_records_one()
    : m.musilogy_records_other({ count: String(credit.records) });
}

/**
 * The filiation (docs/vision.md §2.4): members, each with its other groups, or a person's groups;
 * other names; then the artists credited with it, the most records first. Rubrics rather than
 * MusicBrainz's dozen relation types.
 */
function Filiation({ artist }: { artist: MusilogyArtist }) {
  const { bands, memberProjects, otherNames, credits } = artist;
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
      {credits && credits.length > 0 ? (
        <SubList label={m.musilogy_credited()}>
          <InlineArtists artists={credits} noteOf={recordsOf} limit={FIRST_SHOWN} />
        </SubList>
      ) : null}
    </div>
  );
}

function filiationCount({ bands, memberProjects, otherNames, credits }: MusilogyArtist): number {
  return (
    (bands ? bands.members.length + bands.groups.length : 0) +
    (memberProjects?.length ?? 0) +
    (otherNames?.length ?? 0) +
    (credits?.length ?? 0)
  );
}

interface CloseTab extends Tab {
  /** The section's intro while the tab is shown: what its list is. */
  note: string;
}

/**
 * The tabs that have something to show, in the order a reader goes: the same sound, the same
 * public, then the facts of the filiation (docs/vision.md §2.2).
 */
function closeTabs(artist: MusilogyArtist, thisYear: number): CloseTab[] {
  const { card, sameSound, colisten } = artist;
  return [
    sameSound?.length
      ? {
          id: 'same-sound',
          label: m.musilogy_tab_same_sound(),
          note: sameSoundNote(sameSound),
          panel: <MusilogyTimeline card={card} close={sameSound} thisYear={thisYear} />,
        }
      : null,
    colisten?.length
      ? {
          id: 'colisten',
          label: m.musilogy_tab_colisten(),
          note: m.musilogy_colisten_note(),
          panel: <MusilogyTimeline card={card} close={colisten} thisYear={thisYear} />,
        }
      : null,
    filiationCount(artist) > 0
      ? {
          id: 'filiation',
          label: m.musilogy_tab_filiation(),
          note: m.musilogy_filiation_note(),
          panel: <Filiation artist={artist} />,
        }
      : null,
  ].filter((tab) => tab !== null);
}

/** The sections MusilogySections shows, for the page's anchors (PageNav). */
export function musilogyNav(artist: MusilogyArtist): PageNavItem[] {
  const close =
    Boolean(artist.sameSound?.length) ||
    Boolean(artist.colisten?.length) ||
    filiationCount(artist) > 0;
  return close ? [{ id: 'close', label: m.musilogy_close_title() }] : [];
}

/**
 * Where to go next from an artist: its close artists, in three tabs, the first one with something
 * to show open. A tab with nothing in it is left out, and the section with it when all are: no
 * « nothing yet » under a title.
 */
export function MusilogySections({
  artist,
  thisYear,
}: {
  artist: MusilogyArtist;
  thisYear: number;
}) {
  const tabs = closeTabs(artist, thisYear);
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = tabs.find((tab) => tab.id === chosen) ?? tabs[0];
  if (!shown) return null;
  return (
    <Section id="close" title={m.musilogy_close_title()} body={shown.note} sticky>
      <Tabs label={m.musilogy_close_title()} tabs={tabs} selected={shown.id} onSelect={setChosen} />
    </Section>
  );
}
