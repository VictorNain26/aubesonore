// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as icons from './icons';
import { CloseIcon, SearchIcon } from './icons';

// A decorative icon is hidden from the accessibility tree, so the tests read its wrapper's markup.
const markup = (testId: string) => screen.getByTestId(testId).innerHTML;

describe('icons', () => {
  it('are decoration by default: the button around them carries the name', () => {
    render(
      <button type="button" aria-label="Fermer" data-testid="close">
        <CloseIcon />
      </button>
    );
    expect(markup('close')).toMatch(/^<svg[^>]* aria-hidden="true"/);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });

  it('take a name when they stand alone', () => {
    render(<SearchIcon title="Chercher" />);
    expect(screen.getByRole('img', { name: 'Chercher' })).not.toHaveAttribute('aria-hidden');
  });

  it('draw in the colour of the text around them, at the size they are given', () => {
    render(<SearchIcon title="Chercher" className="size-4" />);
    const icon = screen.getByRole('img', { name: 'Chercher' });
    expect(icon).toHaveAttribute('stroke', 'currentColor');
    expect(icon).toHaveClass('size-4');
  });

  it('draw a 1.4 px line at every size, as the wave beside them', () => {
    const drawn = Object.entries(icons).filter(([name]) => name.endsWith('Icon'));
    const lines = drawn.map(([name, Icon]) => {
      const { unmount } = render(
        <span data-testid={name}>
          <Icon className="size-6" />
        </span>
      );
      const svg = markup(name);
      unmount();
      return {
        name,
        width: svg.match(/^<svg[^>]* stroke-width="([\d.]+)"/)?.[1],
        shapes: svg.match(/<(path|circle)\b/g)?.length ?? 0,
        unscaled: svg.match(/<(path|circle)\b[^>]* vector-effect="non-scaling-stroke"/g)?.length,
      };
    });
    for (const line of lines) {
      expect(line.shapes).toBeGreaterThan(0);
      expect(line).toEqual({ ...line, width: '1.4', unscaled: line.shapes });
    }
  });
});
