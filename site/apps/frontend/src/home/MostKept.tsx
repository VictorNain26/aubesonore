import { Link } from 'react-router';
import type { TrendEntry, TrendsResult } from '@aubesonore/shared-types/client';
import type { Loaded } from '../lib/homeData';
import { artistPath } from '../lib/artistProfile';
import { Cover } from '../design/Cover';
import * as m from '@/paraglide/messages.js';

export interface MostKeptViewProps {
  /** The tracks kept this week, the most kept first, as /api/trends ranks them. */
  week: TrendEntry[] | null;
  status: 'loading' | 'error' | 'ready';
}

/**
 * A cover, its title and its artist; with the artist's page, a link there, named for both. Under
 * the pointer the cover grows a little (design/tokens.css, kept-link): a dimmed one read as
 * disabled.
 */
function Kept({ entry }: { entry: TrendEntry }) {
  const body = (
    <>
      <Cover
        src={entry.artworkUrl}
        alt=""
        seed={`${entry.artist}|${entry.title}`}
        lowPriority
        // Ten small covers at most: fetched with the page, so the row never scrolls onto empty
        // squares.
        eager
        // 104 px beside the cover on air (hero-split, design/tokens.css), 120 on a phone.
        sizes="(min-width: 40rem) and (orientation: landscape) 6.5rem, 7.5rem"
        className="aspect-square w-full"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-small truncate font-semibold" title={entry.title}>
          {entry.title}
        </span>
        <span className="text-small text-text-muted truncate font-normal">
          {entry.artistPage?.name ?? entry.artist}
        </span>
      </span>
    </>
  );
  return entry.artistPage ? (
    <Link
      to={artistPath(entry.artistPage)}
      aria-label={`${entry.title}, ${entry.artistPage.name}`}
      className="kept-link focus-visible:outline-accent flex flex-col gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {body}
    </Link>
  ) : (
    <div className="flex flex-col gap-1.5">{body}</div>
  );
}

/**
 * « Les plus gardés de la semaine »: every track kept in the last seven days, the most kept first,
 * as one row that scrolls sideways, each cover snapping to its start and the next peeking past
 * the edge (design/tokens.css, kept-rail). The row is a stop of the keyboard, whose arrows scroll
 * it. In the hero beside the cover on air; on a phone, under the hero. Nothing while it loads, nor
 * for an empty week.
 */
export function MostKeptView({ week, status }: MostKeptViewProps) {
  // Nothing while it loads or for an empty week: no title over an absence.
  if (status === 'loading' || week?.length === 0) return null;
  return (
    <section aria-labelledby="most-kept-title" className="hero-kept">
      <h2 id="most-kept-title" className="text-small text-text-muted m-0 mb-2 font-normal">
        {m.most_kept_title()}
      </h2>
      {week ? (
        <ol
          // A keyboard stop of its own: the row scrolls under the arrows (WCAG 2.1.1), with or
          // without a link in it.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-labelledby="most-kept-title"
          className="kept-rail focus-visible:outline-accent m-0 list-none p-0 focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          {week.map((entry) => (
            <li key={`${entry.artist}|${entry.title}`}>
              <Kept entry={entry} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-small text-text-muted m-0">{m.most_kept_error()}</p>
      )}
    </section>
  );
}

export function MostKept({ trends }: { trends: Loaded<TrendsResult> | null }) {
  return (
    <MostKeptView
      week={trends === null || trends === 'failed' ? null : trends.week}
      status={trends === null ? 'loading' : trends === 'failed' ? 'error' : 'ready'}
    />
  );
}
