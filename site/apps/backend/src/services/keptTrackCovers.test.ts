import { describe, expect, it, mock } from 'bun:test';
import { coverArtUrl } from '@aubesonore/shared-types/client';
import type { Lookup } from '../lib/lookup';
import type { FillOutcome } from './coverStore';
import { createCoverFinder, createKeptCoverFill, coverTrack } from './keptTrackCovers';
import type { RecordingOnReleases, RecordingRelease } from './musicbrainzService';

const HANIA = '59be490d-21e4-44d4-8cf2-939c8fbca25f';
const SINGLE = '37b5994e-d560-480d-b013-e84d9a427b2a';
const ALBUM = 'ba385009-ffe0-4360-becf-44564d44a0a3';
const LIVE = '3c67bda1-9eda-4517-933d-8d790d925702';

const release = (
  releaseGroup: string,
  date: string | null,
  more: Partial<RecordingRelease> = {}
) => ({
  releaseGroup,
  official: true,
  secondaryTypes: [],
  date,
  ...more,
});

const recording = (
  title: string,
  releases: RecordingRelease[],
  credits = [{ mbid: HANIA, names: ['Hania Rani', 'Hania Rani'] }]
): RecordingOnReleases => ({ title, credits, releases });

const found = (value: RecordingOnReleases[]): Lookup<RecordingOnReleases[]> => ({
  status: 'found',
  value,
});

function finder(
  answers: { isrc?: Lookup<RecordingOnReleases[]>; title?: Lookup<RecordingOnReleases[]> },
  covers: Record<string, FillOutcome> = {}
) {
  const search = mock((of: { isrc: string } | { name: string; title: string }) =>
    Promise.resolve(('isrc' in of ? answers.isrc : answers.title) ?? { status: 'none' as const })
  );
  const fill = mock((id: string) => Promise.resolve(covers[id] ?? 'stored'));
  return { find: createCoverFinder({ search, fill }), search, fill };
}

const track = { title: 'F Major', artist: 'Hania Rani', isrc: null };

describe('the cover of a kept track', () => {
  it("is the Cover Art Archive's cover of the first record of the recording its ISRC names", async () => {
    const { find, search } = finder({
      isrc: found([
        recording('F Major', [release(ALBUM, '2020-05-29')]),
        recording('F Major', [release(SINGLE, '2020-04-03')]),
      ]),
    });

    expect(await find({ ...track, isrc: 'GBVTB2037007' })).toEqual({
      status: 'found',
      value: coverArtUrl(SINGLE, 500),
    });
    expect(search.mock.calls).toEqual([[{ isrc: 'GBVTB2037007' }]]);
  });

  it('never takes the record of an ISRC filed on another title or another artist', async () => {
    const { find, search } = finder({
      isrc: found([
        recording('Other Song', [release(SINGLE, '2020-04-03')]),
        recording('F Major', [release(SINGLE, '2020-04-03')], [{ mbid: 'x', names: ['ANNA'] }]),
      ]),
      title: found([recording('F Major', [release(ALBUM, '2020-05-29')])]),
    });

    expect(await find({ ...track, isrc: 'GBVTB2037007' })).toEqual({
      status: 'found',
      value: coverArtUrl(ALBUM, 500),
    });
    expect(search.mock.calls[1]).toEqual([{ name: 'Hania Rani', title: 'F Major' }]);
  });

  it('by title, takes exactly the kept title by the kept name, its first credited artist', async () => {
    const { find, search } = finder({
      title: found([
        recording('F Major Again', [release(SINGLE, '2019-01-01')]),
        recording('F Major', [release(ALBUM, '2020-05-29')]),
      ]),
    });

    expect(await find({ ...track, artist: 'Hania Rani feat. Someone' })).toEqual({
      status: 'found',
      value: coverArtUrl(ALBUM, 500),
    });
    expect(search.mock.calls).toEqual([[{ name: 'Hania Rani', title: 'F Major' }]]);
  });

  it('gives none when two artists of that name have the title: a homonym is no match', async () => {
    const { find, fill } = finder({
      title: found([
        recording('F Major', [release(SINGLE, '2020-04-03')]),
        recording(
          'F Major',
          [release(ALBUM, '2020-05-29')],
          [{ mbid: 'other', names: ['Hania Rani'] }]
        ),
      ]),
    });

    expect(await find(track)).toEqual({ status: 'none' });
    expect(fill).not.toHaveBeenCalled();
  });

  it("leaves out bootlegs and records that are not the artist's own (live, compilation)", async () => {
    const { find } = finder({
      title: found([
        recording('F Major', [
          release(LIVE, '2019-01-01', { secondaryTypes: ['Live'] }),
          release(SINGLE, '2019-06-01', { official: false }),
          release(ALBUM, '2020-05-29'),
        ]),
      ]),
    });

    expect(await find(track)).toEqual({ status: 'found', value: coverArtUrl(ALBUM, 500) });
  });

  it('takes the next record when the archive has no cover for the first', async () => {
    const { find } = finder(
      {
        title: found([
          recording('F Major', [release(ALBUM, '2020-05-29'), release(SINGLE, '2020-04-03')]),
        ]),
      },
      { [SINGLE]: 'missing' }
    );

    expect(await find(track)).toEqual({ status: 'found', value: coverArtUrl(ALBUM, 500) });
  });

  it('gives none when no record has a cover, or the cover was taken down', async () => {
    const none = finder(
      { title: found([recording('F Major', [release(SINGLE, '2020-04-03')])]) },
      { [SINGLE]: 'known-missing' }
    );
    expect(await none.find(track)).toEqual({ status: 'none' });

    const blocked = finder(
      {
        title: found([
          recording('F Major', [release(SINGLE, '2020-04-03'), release(ALBUM, '2020-05-29')]),
        ]),
      },
      { [SINGLE]: 'blocked' }
    );
    expect(await blocked.find(track)).toEqual({ status: 'none' });
    expect(blocked.fill.mock.calls).toEqual([[SINGLE]]);
  });

  it('fails, rather than give none, when MusicBrainz or the archive fails', async () => {
    expect(await finder({ isrc: { status: 'failed' } }).find({ ...track, isrc: 'X' })).toEqual({
      status: 'failed',
    });
    expect(await finder({ title: { status: 'failed' } }).find(track)).toEqual({
      status: 'failed',
    });
    const archive = finder(
      { title: found([recording('F Major', [release(SINGLE, '2020-04-03')])]) },
      { [SINGLE]: 'failed' }
    );
    expect(await archive.find(track)).toEqual({ status: 'failed' });
  });
});

describe('coverTrack', () => {
  const cover = coverArtUrl(SINGLE, 500);

  it('copies the cover another listener’s copy of the track already has, asking nothing', async () => {
    const write = mock((_title: string, _artist: string, _url: string) => Promise.resolve());
    const find = mock(() => Promise.resolve({ status: 'none' as const }));

    expect(await coverTrack(track, { stored: () => Promise.resolve(cover), find, write })).toBe(
      'copied'
    );
    expect(write.mock.calls).toEqual([['F Major', 'Hania Rani', cover]]);
    expect(find).not.toHaveBeenCalled();
  });

  it('writes the cover found, and nothing when there is none or the lookup failed', async () => {
    const write = mock((_title: string, _artist: string, _url: string) => Promise.resolve());
    const stored = () => Promise.resolve(null);
    const answer = (lookup: Lookup<string>) => () => Promise.resolve(lookup);

    expect(
      await coverTrack(track, { stored, find: answer({ status: 'found', value: cover }), write })
    ).toBe('found');
    expect(await coverTrack(track, { stored, find: answer({ status: 'none' }), write })).toBe(
      'none'
    );
    expect(await coverTrack(track, { stored, find: answer({ status: 'failed' }), write })).toBe(
      'failed'
    );
    expect(write.mock.calls).toEqual([['F Major', 'Hania Rani', cover]]);
  });
});

describe('the pass over kept tracks without a cover', () => {
  const NOON = Date.parse('2026-10-27T11:00:00Z');
  const MIDNIGHT = Date.parse('2026-10-27T23:30:00Z');

  it('pauses a second after each track MusicBrainz was asked about, none after a copy', async () => {
    const outcomes = ['found', 'copied', 'none', 'failed'] as const;
    const sleep = mock((_ms: number) => Promise.resolve());
    const fill = createKeptCoverFill({
      tracks: () => Promise.resolve(outcomes.map((title) => ({ ...track, title }))),
      cover: (t) => Promise.resolve(t.title as (typeof outcomes)[number]),
      now: () => NOON,
      sleep,
    });

    expect(await fill.runPass()).toEqual({ found: 1, copied: 1, none: 1, failed: 1 });
    expect(sleep.mock.calls).toEqual([[1000], [1000], [1000]]);
  });

  it('waits for the day before asking anything', async () => {
    let now = MIDNIGHT;
    const sleep = mock((_ms: number) => {
      now = NOON;
      return Promise.resolve();
    });
    const cover = mock(() => Promise.resolve('copied' as const));
    const fill = createKeptCoverFill({
      tracks: () => Promise.resolve([track]),
      cover,
      now: () => now,
      sleep,
    });

    await fill.runPass();

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(cover).toHaveBeenCalledTimes(1);
  });
});
