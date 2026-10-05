import { useState } from 'react';
import type { MusilogyRelease } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { Section } from '../design/molecules/Section';
import { Cover } from '../home/Cover';
import { TEXT_ACTION } from '../home/styles';

// A prolific artist files dozens of EPs (the Rolling Stones about 150 regional
// ones): the first show, the rest open on demand. Albums all show.
const EPS_SHOWN = 8;

/**
 * The Cover Art Archive's thumbnail of a release group: a redirect to the
 * image, or 404 when none was chosen, and Cover then shows its wave.
 */
export function coverOf(release: MusilogyRelease): string {
  return `https://coverartarchive.org/release-group/${release.mbid}/front-250`;
}

function Record({ release }: { release: MusilogyRelease }) {
  const hints = [
    release.year ? String(release.year) : null,
    release.soundtrack ? m.artist_record_soundtrack() : null,
    release.remix ? m.artist_record_remix() : null,
  ].filter(Boolean);
  return (
    <li className="reveal flex min-w-0 flex-col gap-2">
      {/* The home page's hover on a cover (MostKept): one style for every cover of the site. */}
      <Cover
        src={coverOf(release)}
        alt=""
        seed={release.title}
        className="ease-out-soft hover:shadow-lift aspect-square w-full transition-[translate,box-shadow] duration-500 motion-safe:hover:-translate-y-1.5"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-ui break-words">{release.title}</span>
        {hints.length > 0 ? (
          <span className="text-ui text-text-muted font-mono tabular-nums">
            {hints.join(' · ')}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function Records({ releases }: { releases: readonly MusilogyRelease[] }) {
  return (
    <ol className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-8 p-0 sm:grid-cols-3 lg:grid-cols-4">
      {releases.map((release) => (
        <Record key={release.mbid} release={release} />
      ))}
    </ol>
  );
}

/** Albums, then EPs, each from the earliest: the order musilogy gives them in. */
export function ReleasesSection({ releases }: { releases: readonly MusilogyRelease[] }) {
  const [open, setOpen] = useState(false);
  const albums = releases.filter((release) => release.type === 'album');
  const eps = releases.filter((release) => release.type === 'ep');
  const shownEps = open ? eps : eps.slice(0, EPS_SHOWN);
  const both = albums.length > 0 && eps.length > 0;
  return (
    <Section id="records" title={m.artist_records_title()} sticky>
      <div className="flex flex-col gap-10">
        {albums.length > 0 ? (
          <div className="flex flex-col gap-4">
            {both ? (
              <h3 className="text-ui text-text-muted m-0 font-normal">
                {m.artist_records_albums()}
              </h3>
            ) : null}
            <Records releases={albums} />
          </div>
        ) : null}
        {eps.length > 0 ? (
          <div className="flex flex-col gap-4">
            {both ? (
              <h3 className="text-ui text-text-muted m-0 font-normal">{m.artist_records_eps()}</h3>
            ) : null}
            <Records releases={shownEps} />
            {eps.length > shownEps.length ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className={`${TEXT_ACTION} self-start`}
              >
                {m.musilogy_show_more({ count: String(eps.length - shownEps.length) })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
