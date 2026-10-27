import { describe, expect, it } from 'bun:test';
import type { FillOutcome } from './coverStore';
import { createCoverFill, isDaytime } from './coverFill';

// 2026-10-27 is in winter time: Paris is UTC+1.
const paris = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 9, 27, hour - 1, minute)).getTime();

describe('isDaytime', () => {
  it('is day from 08:00 to 23:00 in Paris, whatever the server’s clock', () => {
    expect(isDaytime(paris(7, 59))).toBe(false);
    expect(isDaytime(paris(8, 0))).toBe(true);
    expect(isDaytime(paris(22, 59))).toBe(true);
    expect(isDaytime(paris(23, 0))).toBe(false);
    expect(isDaytime(paris(3, 0))).toBe(false);
    // Summer time: 08:00 in Paris is 06:00 UTC.
    expect(isDaytime(Date.UTC(2026, 6, 1, 6, 0))).toBe(true);
    expect(isDaytime(Date.UTC(2026, 6, 1, 5, 59))).toBe(false);
  });
});

function harness(outcomes: Record<string, FillOutcome>, start = paris(10)) {
  let clock = start;
  const events: string[] = [];
  const fill = createCoverFill({
    releaseGroups: () => Promise.resolve(Object.keys(outcomes)),
    fill: (id) => {
      events.push(`fill ${id}`);
      return Promise.resolve(outcomes[id]!);
    },
    now: () => clock,
    sleep: (ms) => {
      events.push(`sleep ${ms}`);
      clock += ms;
      return Promise.resolve();
    },
  });
  return { fill, events };
}

describe('the daytime fill', () => {
  it('pauses a second after each cover asked of the archive, none after one already known', async () => {
    const { fill, events } = harness({
      a: 'stored',
      b: 'present',
      c: 'missing',
      d: 'known-missing',
      e: 'failed',
    });

    const tally = await fill.runPass();

    expect(events).toEqual([
      'fill a',
      'sleep 1000',
      'fill b',
      'fill c',
      'sleep 1000',
      'fill d',
      'fill e',
      'sleep 1000',
    ]);
    expect(tally).toEqual({ stored: 1, present: 1, missing: 1, 'known-missing': 1, failed: 1 });
  });

  it('waits for the morning when night falls, then goes on where it stopped', async () => {
    // Half a second of day left: the pause after the first cover ends at night.
    const { fill, events } = harness({ a: 'stored', b: 'stored' }, paris(23) - 500);

    await fill.runPass();

    const nightSleeps = events.filter((e) => e.startsWith('sleep') && e !== 'sleep 1000');
    expect(events[0]).toBe('fill a');
    expect(nightSleeps.length).toBeGreaterThan(0);
    // b is filled only once it is day again.
    expect(events.at(-2)).toBe('fill b');
  });

  it('asks the archive nothing at night', async () => {
    const { fill, events } = harness({ a: 'stored' }, paris(2));

    await fill.runPass();

    const firstFill = events.indexOf('fill a');
    const slept = events
      .slice(0, firstFill)
      .reduce((total, e) => total + Number(e.split(' ')[1]), 0);
    // From 02:00 to 08:00 at least.
    expect(slept).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
  });
});
