// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ArtistImage } from '@aubesonore/shared-types/client';
import { ArtistPortrait, dawnOf } from './ArtistPortrait';

const PHOTO: ArtistImage = {
  kind: 'photo',
  url: 'https://upload.wikimedia.org/wikipedia/commons/6/61/Can_1972.jpg',
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
    render(<ArtistPortrait image={PHOTO} name="Can" seed={SEED} />);

    fireEvent.click(screen.getByRole('button', { name: "Voir l'image de Can en grand" }));

    const dialog = await screen.findByRole('dialog', { name: 'Can' });
    expect(within(dialog).getByRole('img', { name: 'Portrait de Can' })).toHaveProperty(
      'src',
      PHOTO.url
    );
    expect(within(dialog).getByRole('link', { name: 'Photo Heinrich Klaffs' })).toHaveProperty(
      'href',
      'https://commons.wikimedia.org/wiki/File:Can_1972.jpg'
    );
    expect(within(dialog).getByRole('link', { name: 'CC BY-SA 2.0' })).toHaveProperty(
      'href',
      'https://creativecommons.org/licenses/by-sa/2.0'
    );
  });

  it('marks a photo, and only a photo, with a small ©', () => {
    const { rerender } = render(<ArtistPortrait image={PHOTO} name="Can" seed={SEED} />);
    expect(screen.getByText('©')).toBeTruthy();

    rerender(<ArtistPortrait image={COVER} name="Neu!" seed={SEED} />);
    expect(screen.queryByText('©')).toBeNull();
  });

  it('opens a cover at 1200 px with its record and year, crediting nobody', async () => {
    render(<ArtistPortrait image={COVER} name="Neu!" seed={SEED} />);

    fireEvent.click(screen.getByRole('button', { name: "Voir l'image de Neu! en grand" }));

    const dialog = await screen.findByRole('dialog', { name: 'Neu!' });
    expect(within(dialog).getByRole('img').getAttribute('src')).toMatch(/\/front-1200$/);
    expect(within(dialog).getByText('Neu!, 1972')).toBeTruthy();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it("draws the artist's dawn without an image, and when the image fails to load", () => {
    const { rerender } = render(<ArtistPortrait image={null} name="Can" seed={SEED} />);
    expect(screen.getByTestId('artist-dawn')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<ArtistPortrait image={PHOTO} name="Can" seed={SEED} />);
    // The thumbnail is decoration: the button around it carries the name.
    fireEvent.error(within(screen.getByRole('button')).getByRole('presentation'));
    expect(screen.getByTestId('artist-dawn')).toBeTruthy();
  });

  it('gives an artist always the same dawn, and two artists different ones', () => {
    expect(dawnOf(SEED)).toEqual(dawnOf(SEED));
    expect(dawnOf(SEED)).not.toEqual(dawnOf('adec1fc3-83c1-48f7-9e49-8347ac6d40b0'));
  });
});
