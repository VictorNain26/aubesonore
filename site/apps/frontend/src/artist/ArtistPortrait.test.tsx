// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ArtistImage } from '@aubesonore/shared-types/client';
import { ArtistPortrait, dawnOf } from './ArtistPortrait';

const PHOTO: ArtistImage = {
  kind: 'photo',
  url: 'https://upload.wikimedia.org/wikipedia/commons/6/61/Can_1972.jpg',
  width: 1280,
  height: 850,
  credit: {
    author: 'Heinrich Klaffs',
    licence: 'CC BY-SA 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Can_1972.jpg',
  },
};

const COVER: ArtistImage = {
  kind: 'cover',
  url: 'https://coverartarchive.org/release-group/00b3e683-47fa-3302-add0-4c0cecc5224e/front-500',
  title: 'Neu!',
  year: 1972,
};

const SEED = '13501c7d-d181-45ba-af52-5f101d8516a0';

describe('ArtistPortrait', () => {
  it('opens a photo large with the credit its licence asks for, each part a link', async () => {
    render(<ArtistPortrait images={[PHOTO]} name="Can" seed={SEED} />);

    fireEvent.click(screen.getByRole('button', { name: "Voir l'image de Can en grand" }));

    const dialog = await screen.findByRole('dialog', { name: 'Can' });
    const large = within(dialog).getByRole('img', { name: 'Portrait de Can' });
    expect(large).toHaveProperty('src', PHOTO.url);
    // Opened at its shape, before the file arrives.
    expect([large.getAttribute('width'), large.getAttribute('height')]).toEqual(['1280', '850']);
    expect(within(dialog).getByRole('link', { name: 'Photo Heinrich Klaffs' })).toHaveProperty(
      'href',
      'https://commons.wikimedia.org/wiki/File:Can_1972.jpg'
    );
    expect(within(dialog).getByRole('link', { name: 'CC BY-SA 2.0' })).toHaveProperty(
      'href',
      'https://creativecommons.org/licenses/by-sa/2.0'
    );
  });

  it('shows an image at its own shape, never cut: a photo its own, a cover square', () => {
    const tall: ArtistImage = { ...PHOTO, width: 1280, height: 1920 };
    const { rerender } = render(<ArtistPortrait images={[tall]} name="Can" seed={SEED} />);
    const shown = () => within(screen.getByRole('button')).getByRole('presentation');
    expect(screen.getByRole('button').style.aspectRatio).toBe('1280 / 1920');
    expect(shown().className).toContain('object-cover');
    // Fetched at the width it is drawn: a tall photo narrower than the line.
    expect(shown().getAttribute('sizes')).toContain('min(100vw - 3rem, 13.75rem * 1280 / 1920)');

    // A cover's size is not known: whole inside a square, even one that is not quite square.
    rerender(<ArtistPortrait images={[COVER]} name="Neu!" seed={SEED} />);
    expect(screen.getByRole('button').style.aspectRatio).toBe('1 / 1');
    expect(shown().className).toContain('object-contain');

    // Commons gave no size: the whole photo inside a square.
    rerender(
      <ArtistPortrait images={[{ ...PHOTO, width: null, height: null }]} name="Can" seed={SEED} />
    );
    expect(screen.getByRole('button').style.aspectRatio).toBe('1 / 1');
    expect(shown().className).toContain('object-contain');
  });

  it('marks a photo, and only a photo, with a small ©', () => {
    const { rerender } = render(<ArtistPortrait images={[PHOTO]} name="Can" seed={SEED} />);
    expect(screen.getByText('©')).toBeTruthy();

    rerender(<ArtistPortrait images={[COVER]} name="Neu!" seed={SEED} />);
    expect(screen.queryByText('©')).toBeNull();
  });

  it('opens a cover at 1200 px with its record and year, crediting nobody', async () => {
    render(<ArtistPortrait images={[COVER]} name="Neu!" seed={SEED} />);

    fireEvent.click(screen.getByRole('button', { name: "Voir l'image de Neu! en grand" }));

    const dialog = await screen.findByRole('dialog', { name: 'Neu!' });
    const large = within(dialog).getByRole('img', { name: 'Pochette de Neu!' });
    // The Cover Art Archive's covers come through this site (nginx.conf, /caa/).
    expect(large.getAttribute('src')).toBe('/caa/1200/00b3e683-47fa-3302-add0-4c0cecc5224e.jpg');
    // A cover without its large file keeps the one already shown.
    fireEvent.error(large);
    expect(large.getAttribute('src')).toBe('/caa/500/00b3e683-47fa-3302-add0-4c0cecc5224e.jpg');
    expect(within(dialog).getByText('Neu!, 1972')).toBeTruthy();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it("shows the next image when one fails to load, and the artist's dawn past the last", () => {
    render(<ArtistPortrait images={[PHOTO, COVER]} name="Can" seed={SEED} />);
    expect(screen.getByText('©')).toBeTruthy();

    fireEvent.error(within(screen.getByRole('button')).getByRole('presentation'));
    expect(screen.queryByText('©')).toBeNull();
    expect(within(screen.getByRole('button')).getByRole('presentation').getAttribute('src')).toBe(
      '/caa/500/00b3e683-47fa-3302-add0-4c0cecc5224e.jpg'
    );

    fireEvent.error(within(screen.getByRole('button')).getByRole('presentation'));
    expect(screen.getByTestId('artist-dawn')).toBeTruthy();
  });

  it("draws the artist's dawn without an image, and when the image fails to load", () => {
    const { rerender } = render(<ArtistPortrait images={[]} name="Can" seed={SEED} />);
    expect(screen.getByTestId('artist-dawn')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<ArtistPortrait images={[PHOTO]} name="Can" seed={SEED} />);
    // The thumbnail is decoration: the button around it carries the name.
    fireEvent.error(within(screen.getByRole('button')).getByRole('presentation'));
    expect(screen.getByTestId('artist-dawn')).toBeTruthy();
  });

  it('gives an artist always the same dawn, and two artists different ones', () => {
    expect(dawnOf(SEED)).toEqual(dawnOf(SEED));
    expect(dawnOf(SEED)).not.toEqual(dawnOf('adec1fc3-83c1-48f7-9e49-8347ac6d40b0'));
  });
});
