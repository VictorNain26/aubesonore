import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The charter's two shapes (tokens.css, --radius-full): the disc for listening and the live, the
 * right angle for everything else. The pill had become the shape of every link, field and button
 * (37 uses before the charter), so a new one has to be argued here. The list is exact: a file that
 * no longer draws a disc leaves it too.
 */
const DISCS: Record<string, string> = {
  'home/listen.tsx': 'the Écouter pill, its disc and the live bars',
  'home/Horizon.tsx': 'the now dot on the horizon',
  'shell/PlayerBar.tsx': "the player bar's disc and controls, and the live dot",
  'shell/NowPlayingSheet.tsx': "the player sheet's controls and handle",
  'shell/VolumeControl.tsx': "the player's volume button",
  'shell/CastControl.tsx': "the player's Diffuser button",
  'shell/SiteHeader.tsx': "the account's round avatar",
  'design/classes.ts': 'the way back to the live, and the ring of Garder beside Écouter',
  'design/onAir.tsx': 'the live dot above the title',
  'design/Slider.tsx': "the slider's thumb",
  'design/Button.tsx': "the loading spinner's ring",
};

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'paraglide' ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('shapes', () => {
  it('draws a disc only where the charter keeps one', () => {
    const withDisc = sources(SRC)
      .filter((path) => readFileSync(path, 'utf8').includes('rounded-full'))
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .sort();
    expect(withDisc).toEqual(Object.keys(DISCS).sort());
  });
});
