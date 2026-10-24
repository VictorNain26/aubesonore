import { getLocale } from '@/paraglide/runtime.js';
import { Wave } from '../design/Wave';

export interface DayTick {
  /** The hour of the clock, 0..23. */
  hour: number;
  /** Where it sits along the line, 0 (midnight) .. 1 (the line's end). */
  at: number;
  /** Its name ("07 h"), or null where the labels would crowd. */
  label: string | null;
}

/** At most this many hours are named; the others keep their tick. */
const MAX_LABELS = 9;
const LABEL_STEPS = [1, 2, 3, 4, 6];

/**
 * The scale of the day so far, on the clock of the page, as the thread counts "today" (lib/time):
 * from midnight to a little past now, so now sits near the line's right end with some day still
 * ahead of it, never past 24 h. A tick every hour, a name every one, two or three as the day
 * grows.
 */
export function dayScale(now: Date): { ticks: DayTick[]; now: number } {
  const hours = now.getHours() + now.getMinutes() / 60;
  const end = Math.min(24, Math.max(hours + 0.5, hours * 1.15));
  const last = Math.min(23, Math.floor(end));
  const step =
    LABEL_STEPS.find((s) => Math.floor(last / s) + 1 <= MAX_LABELS) ?? LABEL_STEPS.at(-1)!;
  const format = new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', hourCycle: 'h23' });
  const ticks = Array.from({ length: last + 1 }, (_, hour) => ({
    hour,
    at: hour / end,
    label:
      hour % step === 0
        ? format.format(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour))
        : null,
  }));
  return { ticks, now: hours / end };
}

const percent = (share: number) => `${(share * 100).toFixed(2)}%`;

/**
 * The day so far above the thread: the line, calm and still (so still under reduced motion too),
 * a tick at every hour with its name in tabular figures, and a lit dot at now. Decoration: the
 * rows say their own times.
 */
export function DayLine({ now }: { now: Date }) {
  const scale = dayScale(now);
  return (
    <div data-testid="day-line" aria-hidden="true" className="relative mb-2 h-18">
      <Wave
        height={40}
        amplitude={6}
        seed={1.2}
        className="text-text absolute inset-x-0 top-2.5 h-10 w-full"
      />
      {scale.ticks.map((tick) => (
        <span key={tick.hour} style={{ left: percent(tick.at) }} className="absolute top-0 h-full">
          <span className="bg-text-faint absolute top-6.5 h-2.5 w-px" />
          {tick.label ? (
            <span className="text-caption text-text-faint absolute top-13 -translate-x-1/2 whitespace-nowrap tabular-nums">
              {tick.label}
            </span>
          ) : null}
        </span>
      ))}
      <span
        data-testid="day-now"
        style={{ left: percent(scale.now) }}
        className="bg-text ring-dawn/45 absolute top-6 size-2.5 -translate-x-1/2 rounded-full ring-6"
      />
    </div>
  );
}
