// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CoverOpenLarge, largeArtworkOf } from './CoverOpenLarge';

const ART = 'https://radio.aubesonore.fr/api/station/aubesonore/art/abc123-1700000000.jpg';

function show(src: string | null) {
  return render(
    <CoverOpenLarge
      src={src}
      alt=""
      seed="Gwenno|Ardamm"
      label="Voir la pochette de Ardamm en grand"
      title="Ardamm"
      largeAlt="Pochette de Ardamm, Gwenno"
      caption="Ardamm, Gwenno"
      className="size-11"
    />
  );
}

describe('largeArtworkOf', () => {
  it('asks each host for its largest cover', () => {
    expect(largeArtworkOf('https://coverartarchive.org/release-group/x/front-250')).toBe(
      'https://coverartarchive.org/release-group/x/front-1200'
    );
    expect(largeArtworkOf('https://coverartarchive.org/release-group/x/front-500')).toBe(
      'https://coverartarchive.org/release-group/x/front-1200'
    );
    // The station's original, past the widths nginx makes.
    expect(largeArtworkOf(ART)).toBe(ART);
  });
});

describe('CoverOpenLarge', () => {
  it('opens the cover large with what it is', async () => {
    show(ART);

    fireEvent.click(screen.getByRole('button', { name: 'Voir la pochette de Ardamm en grand' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ardamm' });
    expect(within(dialog).getByRole('img', { name: 'Pochette de Ardamm, Gwenno' })).toHaveProperty(
      'src',
      ART
    );
    expect(within(dialog).getByText('Ardamm, Gwenno')).toBeTruthy();
  });

  it('opens nothing without a real cover, nor once it failed to load', () => {
    const { rerender } = show(null);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <CoverOpenLarge
        src={ART}
        alt=""
        seed="Gwenno|Ardamm"
        label="Voir la pochette de Ardamm en grand"
        title="Ardamm"
        largeAlt="Pochette de Ardamm, Gwenno"
        caption="Ardamm, Gwenno"
      />
    );
    fireEvent.error(within(screen.getByRole('button')).getByRole('presentation'));
    expect(screen.queryByRole('button')).toBeNull();
  });
});
