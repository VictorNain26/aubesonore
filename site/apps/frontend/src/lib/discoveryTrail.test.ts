import { describe, expect, it } from 'vitest';
import { nextTrail } from './discoveryTrail';

const STEREOLAB = { path: '/artiste/stereolab', name: 'Stereolab' };
const MCCARTHY = { path: '/musilogy/m/mccarthy', name: 'McCarthy' };
const GANE = { path: '/musilogy/g/tim-gane', name: 'Tim Gane' };

describe('nextTrail', () => {
  it('goes on along the links from one artist to another', () => {
    expect(nextTrail([STEREOLAB], MCCARTHY, 'link')).toEqual([STEREOLAB, MCCARTHY]);
  });

  it('starts again when the page was reached from anywhere else', () => {
    expect(nextTrail([STEREOLAB, MCCARTHY], GANE, 'elsewhere')).toEqual([GANE]);
  });

  it('cuts the trail at a step already on it, back or tapped', () => {
    expect(nextTrail([STEREOLAB, MCCARTHY, GANE], MCCARTHY, 'back')).toEqual([STEREOLAB, MCCARTHY]);
    expect(nextTrail([STEREOLAB, MCCARTHY, GANE], STEREOLAB, 'link')).toEqual([STEREOLAB]);
  });

  it('starts again when back leads to a page off the trail, and keeps the last six', () => {
    expect(nextTrail([STEREOLAB], GANE, 'back')).toEqual([GANE]);
    const long = Array.from({ length: 6 }, (_, i) => ({ path: `/a/${i}`, name: `A${i}` }));
    expect(nextTrail(long, GANE, 'link').map((s) => s.name)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'Tim Gane',
    ]);
  });
});
