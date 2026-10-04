import { Tabs } from '@base-ui/react/tabs';
import { useTrends, type TrendEntry } from '../hooks/useTrends';
import { Cover } from './Cover';
import * as m from '@/paraglide/messages.js';

type Period = 'week' | 'allTime';

const TAB =
  'text-body text-text-muted data-[active]:text-text ease-out-quart focus-visible:outline-accent min-h-11 font-medium transition-[color,scale] duration-150 active:scale-97 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 data-[active]:font-semibold';

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
    <ol className="m-0 -mx-6 flex scrollbar-none list-none gap-3.5 overflow-x-auto px-6 md:mx-0 md:grid md:grid-cols-5 md:gap-6 md:overflow-visible md:px-0">
      {entries.slice(0, 5).map((entry, i) => (
        <li
          key={`${entry.artist}|${entry.title}`}
          className="reveal flex w-38 shrink-0 flex-col gap-2 md:w-auto md:gap-3"
        >
          <Cover
            src={entry.artworkUrl}
            alt=""
            seed={`${entry.artist}|${entry.title}`}
            className="ease-out-soft hover:shadow-lift aspect-square w-full transition-[translate,box-shadow] duration-500 motion-safe:hover:-translate-y-1.5"
          />
          <span className="text-label text-text-muted flex justify-between font-mono">
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
            <span className="text-sub text-text-muted truncate">{entry.artist}</span>
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
          <div className="reveal-heading flex flex-col gap-2 md:gap-3">
            <h2 id="most-kept-title" className="text-section m-0">
              {m.most_kept_title()}
            </h2>
            <p className="text-intro text-text-muted m-0">{m.most_kept_body()}</p>
          </div>
          <Tabs.List aria-label={m.most_kept_period()} className="relative flex gap-6">
            <Tabs.Tab value="week" className={TAB}>
              {m.trends_tab_week()}
            </Tabs.Tab>
            <Tabs.Tab value="allTime" className={TAB}>
              {m.trends_tab_all_time()}
            </Tabs.Tab>
            <Tabs.Indicator className="bg-accent ease-out-soft absolute bottom-0 left-(--active-tab-left) h-0.5 w-(--active-tab-width) transition-[left,width] duration-300" />
          </Tabs.List>
        </div>

        {(['week', 'allTime'] as const).map((period) => (
          <Tabs.Panel key={period} value={period} className="panel-in">
            {trends ? (
              <Ranking entries={trends[period]} period={period} />
            ) : status === 'error' ? (
              <p className="text-text-muted m-0">{m.most_kept_error()}</p>
            ) : (
              <div aria-busy="true" className="flex gap-3.5 md:grid md:grid-cols-5 md:gap-6">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className="bg-surface-raised aspect-square w-38 shrink-0 rounded-sm md:w-auto"
                  />
                ))}
              </div>
            )}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </section>
  );
}

export function MostKept() {
  const { data, isLoading, hasError } = useTrends();
  return (
    <MostKeptView trends={data} status={isLoading ? 'loading' : hasError ? 'error' : 'ready'} />
  );
}
