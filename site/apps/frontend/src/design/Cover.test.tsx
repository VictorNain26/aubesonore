// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Cover } from './Cover';

const ART =
  'https://coverartarchive.org/release-group/00b3e683-47fa-3302-add0-4c0cecc5224e/front-250';

// jsdom loads no image: say whether one is still loading.
function loading(still: boolean) {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(!still);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Cover', () => {
  it('lets the browser pick the size a resizing host serves for its layout width', () => {
    render(<Cover src={ART} alt="Pochette" seed="x" sizes="2.75rem" />);
    const image = screen.getByRole('img', { name: 'Pochette' });

    expect(image).toHaveAttribute('sizes', '2.75rem');
    expect(image.getAttribute('srcset')).toContain('/250.webp 250w');
    expect(image).toHaveAttribute(
      'src',
      '/covers/caa/00b3e683-47fa-3302-add0-4c0cecc5224e/250.webp'
    );
  });

  it('keeps one file for a host that cannot resize', () => {
    render(
      <Cover
        src="https://radio.aubesonore.fr/api/station/aubesonore/art/abc.jpg"
        alt="Pochette"
        seed="x"
        sizes="2.75rem"
      />
    );

    expect(screen.getByRole('img', { name: 'Pochette' })).not.toHaveAttribute('srcset');
  });

  it('fades a cover in once it has loaded, when it mounts still loading', () => {
    loading(true);
    render(<Cover src={ART} alt="Pochette" seed="seed" />);
    const image = screen.getByRole('img', { name: 'Pochette' });

    expect(image.className).toContain('opacity-0');
    fireEvent.load(image);
    expect(image.className).not.toContain('opacity-0');
  });

  it('never hides a cover already there, nor a priority one the server drew', () => {
    loading(false);
    const { unmount } = render(<Cover src={ART} alt="Pochette" seed="seed" />);
    expect(screen.getByRole('img', { name: 'Pochette' }).className).not.toContain('opacity-0');
    unmount();

    loading(true);
    render(<Cover src={ART} alt="Pochette" seed="seed" priority />);
    expect(screen.getByRole('img', { name: 'Pochette' }).className).not.toContain('opacity-0');
  });

  it('asks this site for a Cover Art Archive cover', () => {
    render(<Cover src={ART} alt="Pochette" seed="seed" />);
    expect(screen.getByRole('img', { name: 'Pochette' }).getAttribute('src')).toBe(
      '/covers/caa/00b3e683-47fa-3302-add0-4c0cecc5224e/250.webp'
    );
  });
});
