// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cover } from './Cover';

const APPLE =
  'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/600x600bb.jpg';

describe('Cover', () => {
  it('lets the browser pick the size a resizing host serves for its layout width', () => {
    render(<Cover src={APPLE} alt="Pochette" seed="x" sizes="2.75rem" />);
    const image = screen.getByRole('img', { name: 'Pochette' });

    expect(image).toHaveAttribute('sizes', '2.75rem');
    expect(image.getAttribute('srcset')).toContain('/160x160bb.jpg 160w');
    expect(image).toHaveAttribute('src', APPLE);
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
});
