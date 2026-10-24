import { Tabs } from '@base-ui/react/tabs';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import type { TrendEntry, TrendsResult } from '@aubesonore/shared-types/client';
import type { Loaded } from '../lib/homeData';
import { artistPath } from '../lib/artistProfile';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { ARTIST_LINK } from '../design/classes';
import * as m from '@/paraglide/messages.js';
import { LineLoader } from '../design/LineLoader';

type Period = 'week' | 'allTime';

const TAB =
  'text-body text-text-muted data-[active]:text-text ease-out-quart focus-visible:outline-accent min-h-11 font-medium transition-[color,scale] duration-150 active:scale-97 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 data-[active]:font-semibold data-[active]:wave-underline';

export interface MostKeptViewProps {
  trends: Record<Period, TrendEntry[]> | null;
  status: 'loading' | 'error' | 'ready';
}

function Ranking({ entries, period }: { entries: TrendEntry[]; period: Period }) {
  if (entries.length === 0) {
    return (
      <p className="text-text-muted m-0">
        {period === 'week' ? m.most_kept_empty_week() : m.most_kept_empty_all_time()}
      </p>
    );
  }

  return (
    <ol className="m-0 -mx-6 -my-2 flex scrollbar-none list-none gap-3.5 overflow-x-auto px-6 py-2 md:mx-0 md:my-0 md:grid md:grid-cols-5 md:gap-6 md:overflow-visible md:px-0 md:py-0">
      {entries.slice(0, 5).map((entry, i) => (
        <li
          key={`${entry.artist}|${entry.title}`}
          className="reveal flex w-38 shrink-0 flex-col gap-2 md:w-auto md:gap-3"
        >
          <CoverOpenLarge
            src={entry.artworkUrl}
            alt=""
            seed={`${entry.artist}|${entry.title}`}
            label={m.cover_open({ title: entry.title })}
            title={entry.title}
            largeAlt={m.now_cover_alt({ title: entry.title, artist: entry.artist })}
            caption={m.track_caption({ title: entry.title, artist: entry.artist })}
            // w-38 on phones; from md, one of five columns of the page (its width less the gutters,
            // up to 100 rem, less four gaps of 1.5 rem).
            sizes="(min-width: 48rem) calc((min(100vw - 5rem, 100rem) - 6rem) / 5), 9.5rem"
            triggerClassName="w-full"
            className="aspect-square w-full"
          />
          <span className="text-caption text-text-muted flex justify-between tabular-nums">
            <span>{String(i + 1).padStart(2, '0')}</span>
            {/* Under two, a count shows how quiet it is rather than what people like. */}
            {entry.likes >= 2 ? (
              <span>{m.most_kept_count_other({ count: entry.likes })}</span>
            ) : null}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-row truncate" title={entry.title}>
              {entry.title}
            </span>
            {entry.artistPage ? (
              // Negative margins grow the tap target to 44px without moving the card.
              <Link
                to={artistPath(entry.artistPage)}
                className={cn(
                  ARTIST_LINK,
                  'text-sub text-text-muted -my-3 max-w-full self-start truncate py-3 underline-offset-4'
                )}
              >
                {entry.artistPage.name}
              </Link>
            ) : (
              <span className="text-sub text-text-muted truncate">{entry.artist}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MostKeptView({ trends, status }: MostKeptViewProps) {
  return (
    <section id="plus-gardes" aria-labelledby="most-kept-title" className="scroll-mt-10">
      <Tabs.Root defaultValue="week" className="flex flex-col gap-6 md:gap-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="reveal flex flex-col gap-2 md:gap-3">
            <h2 id="most-kept-title" className="font-display text-section m-0">
              {m.most_kept_title()}
            </h2>
            <p className="text-intro text-text-muted m-0">{m.most_kept_body()}</p>
          </div>
          <Tabs.List aria-label={m.most_kept_period()} className="flex gap-6">
            <Tabs.Tab value="week" className={TAB}>
              {m.trends_tab_week()}
            </Tabs.Tab>
            <Tabs.Tab value="allTime" className={TAB}>
              {m.trends_tab_all_time()}
            </Tabs.Tab>
          </Tabs.List>
        </div>

        {(['week', 'allTime'] as const).map((period) => (
          <Tabs.Panel key={period} value={period} className="panel-in">
            {trends ? (
              <Ranking entries={trends[period]} period={period} />
            ) : status === 'error' ? (
              <p className="text-text-muted m-0">{m.most_kept_error()}</p>
            ) : (
              <LineLoader className="h-38 md:h-48" />
            )}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </section>
  );
}

export function MostKept({ trends }: { trends: Loaded<TrendsResult> | null }) {
  return (
    <MostKeptView
      trends={trends === null || trends === 'failed' ? null : trends}
      status={trends === null ? 'loading' : trends === 'failed' ? 'error' : 'ready'}
    />
  );
}
