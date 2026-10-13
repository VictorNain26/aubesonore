import { useState } from 'react';
import { coverArtUrl, type MusilogyRelease } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { Section } from '../design/Section';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { TEXT_ACTION } from '../design/classes';

// The first records show, the rest a step at a time: 99 % of the dump's artists file fewer
// than 25, but a prolific one files dozens of EPs (the Rolling Stones about 150 regional ones)
// and a composer thousands of albums (Bach 4 502, 2026-10-12), which no page can draw at once.
const ALBUMS_SHOWN = 24;
const EPS_SHOWN = 8;

/** The release's thumbnail; without one, Cover shows its wave. */
export function coverOf(release: MusilogyRelease): string {
  return coverArtUrl(release.mbid, 250);
}

function Record({ release }: { release: MusilogyRelease }) {
  const hints = [
    release.year ? String(release.year) : null,
    release.soundtrack ? m.artist_record_soundtrack() : null,
    release.remix ? m.artist_record_remix() : null,
  ].filter(Boolean);
  return (
    <li className="reveal flex min-w-0 flex-col gap-2">
      <CoverOpenLarge
        src={coverOf(release)}
        alt=""
        seed={release.title}
        label={m.cover_open({ title: release.title })}
        title={release.title}
        largeAlt={m.artist_cover_alt({ title: release.title })}
        caption={
          release.year
            ? m.artist_cover_caption({ title: release.title, year: String(release.year) })
            : release.title
        }
        triggerClassName="w-full"
        className="aspect-square w-full"
        // Two columns on a phone, three from 40 rem, four from 64 rem; a landscape tablet lays the
        // grid in the section's 8 columns of 12. Measured from the gutters and gaps, so a 3x phone
        // takes the 500 px file rather than the 1200.
        sizes="(min-width: 64rem) 14rem, (min-width: 48rem) and (orientation: landscape) calc((100vw - 9rem) * 2 / 9), (min-width: 40rem) calc((100vw - 8rem) / 3), calc((100vw - 4.5rem) / 2)"
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

/** The first `step` records, and a button that shows `step` more at each press. */
function FoldedRecords({ releases, step }: { releases: readonly MusilogyRelease[]; step: number }) {
  const [shown, setShown] = useState(step);
  return (
    <>
      <Records releases={releases.slice(0, shown)} />
      {releases.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((before) => before + step)}
          className={`${TEXT_ACTION} self-start`}
        >
          {m.musilogy_show_more({ count: String(Math.min(step, releases.length - shown)) })}
        </button>
      ) : null}
    </>
  );
}

/** Albums, then EPs, each from the earliest: the order musilogy gives them in. */
export function ReleasesSection({ releases }: { releases: readonly MusilogyRelease[] }) {
  const albums = releases.filter((release) => release.type === 'album');
  const eps = releases.filter((release) => release.type === 'ep');
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
            <FoldedRecords releases={albums} step={ALBUMS_SHOWN} />
          </div>
        ) : null}
        {eps.length > 0 ? (
          <div className="flex flex-col gap-4">
            {both ? (
              <h3 className="text-ui text-text-muted m-0 font-normal">{m.artist_records_eps()}</h3>
            ) : null}
            <FoldedRecords releases={eps} step={EPS_SHOWN} />
          </div>
        ) : null}
      </div>
    </Section>
  );
}
