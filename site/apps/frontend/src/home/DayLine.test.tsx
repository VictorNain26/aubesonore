// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayLine, dayScale } from './DayLine';

const at = (hours: number, minutes: number) => new Date(2026, 9, 1, hours, minutes);

describe('dayScale', () => {
  it('graduates the day from midnight to just past now, an hour a tick', () => {
    const { ticks, now } = dayScale(at(7, 40));

    expect(ticks.map((t) => t.hour)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ticks[0]!.at).toBe(0);
    // Now sits near the right end, with a little of the day still to come after it.
    expect(now).toBeGreaterThan(0.8);
    expect(now).toBeLessThan(1);
    expect(ticks.at(-1)!.at).toBeGreaterThan(now);
    expect(ticks.every((t) => t.at >= 0 && t.at <= 1)).toBe(true);
  });

  it('labels every hour of a short morning, every third of a long day', () => {
    expect(
      dayScale(at(7, 40))
        .ticks.filter((t) => t.label)
        .map((t) => t.hour)
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(
      dayScale(at(17, 0))
        .ticks.filter((t) => t.label)
        .map((t) => t.hour)
    ).toEqual([0, 3, 6, 9, 12, 15, 18]);
  });

  it('stops at the end of the day, whose last tick is 23 h', () => {
    const { ticks, now } = dayScale(at(23, 50));
    expect(ticks.at(-1)!.hour).toBe(23);
    expect(now).toBeLessThan(1);
  });

  it('keeps room for the first hour just after midnight', () => {
    const { ticks, now } = dayScale(at(0, 10));
    expect(ticks.map((t) => t.hour)).toEqual([0]);
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThan(1);
  });

  it('names the hours on the clock of the page, in its language', () => {
    expect(dayScale(at(7, 40)).ticks[7]!.label).toBe(
      new Intl.DateTimeFormat('fr', { hour: '2-digit', hourCycle: 'h23' }).format(at(7, 0))
    );
  });
});

describe('DayLine', () => {
  it('draws the hours and the dot of now, hidden from assistive tech', () => {
    render(<DayLine now={at(7, 40)} />);

    expect(screen.getByTestId('day-line')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(dayScale(at(7, 40)).ticks[7]!.label!)).toBeInTheDocument();
    expect(screen.getByTestId('day-now')).toHaveStyle({
      left: `${(dayScale(at(7, 40)).now * 100).toFixed(2)}%`,
    });
  });
});
