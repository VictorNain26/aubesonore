import { useState } from 'react';
import { coverArtUrl, type MusilogyRelease } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { Section } from '../design/Section';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { TEXT_ACTION } from '../design/classes';

// The first records show, two rows of six for the albums and one for the EPs, then the rest; past
// sixty more, a step of sixty at a time: 99 % of the dump's artists file fewer than 25, but a
// prolific one files dozens of EPs (the Rolling Stones about 150 regional ones) and a composer
// thousands of albums (Bach 4 502, 2026-10-12), which no page can draw at once.
const ALBUMS_SHOWN = 12;
const EPS_SHOWN = 6;
const STEP = 60;

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
        // Two columns on a phone, three from 40 rem, six from 64 rem, across the page's width.
        // Measured from the gutters (1.5 rem, 2.5 rem from 48 rem), the page's 100 rem and the
        // grid's 1.25 rem gaps, so a 3x phone takes the 500 px file rather than the 1200.
        sizes="(min-width: 64rem) calc((min(100vw - 5rem, 100rem) - 6.25rem) / 6), (min-width: 48rem) calc((100vw - 7.5rem) / 3), (min-width: 40rem) calc((100vw - 5.5rem) / 3), calc((100vw - 4.25rem) / 2)"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-ui break-words">{release.title}</span>
        {hints.length > 0 ? (
          <span className="text-ui text-text-muted tabular-nums">{hints.join(' · ')}</span>
        ) : null}
      </span>
    </li>
  );
}

function Records({ releases }: { releases: readonly MusilogyRelease[] }) {
  return (
    <ol className="m-0 grid list-none grid-cols-2 gap-x-5 gap-y-8 p-0 sm:grid-cols-3 lg:grid-cols-6">
      {releases.map((release) => (
        <Record key={release.mbid} release={release} />
      ))}
    </ol>
  );
}

/** « Voir les 14 autres »: what a press shows, and how many remain when it shows only a step. */
function moreLabel(left: number): string {
  if (left === 1) return m.artist_records_rest_one();
  if (left <= STEP) return m.artist_records_rest_other({ count: String(left) });
  return m.artist_records_next({ step: String(STEP), count: String(left) });
}

/** The first `first` records, and a button that shows the rest, sixty at a time. */
function FoldedRecords({
  releases,
  first,
}: {
  releases: readonly MusilogyRelease[];
  first: number;
}) {
  const [shown, setShown] = useState(first);
  const left = releases.length - shown;
  return (
    <>
      <Records releases={releases.slice(0, shown)} />
      {left > 0 ? (
        <button
          type="button"
          onClick={() => setShown((before) => before + STEP)}
          className={`${TEXT_ACTION} self-start`}
        >
          {moreLabel(left)}
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
    <Section id="records" title={m.artist_records_title()} count={releases.length}>
      <div className="flex flex-col gap-10">
        {albums.length > 0 ? (
          <div className="flex flex-col gap-4">
            {both ? (
              <h3 className="text-ui text-text-muted m-0 font-normal">
                {m.artist_records_albums()}
              </h3>
            ) : null}
            <FoldedRecords releases={albums} first={ALBUMS_SHOWN} />
          </div>
        ) : null}
        {eps.length > 0 ? (
          <div className="flex flex-col gap-4">
            {both ? (
              <h3 className="text-ui text-text-muted m-0 font-normal">{m.artist_records_eps()}</h3>
            ) : null}
            <FoldedRecords releases={eps} first={EPS_SHOWN} />
          </div>
        ) : null}
      </div>
    </Section>
  );
}
