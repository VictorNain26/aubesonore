// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CloseIcon, PlayIcon, SearchIcon } from './icons';

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
});

describe('PlayIcon', () => {
  it('draws Écouter sur YouTube as a triangle in the line, as the mockup does, not filled', () => {
    render(
      <span data-testid="play">
        <PlayIcon />
      </span>
    );
    expect(markup('play')).toContain('<path d="M6 4 L16 10 L6 16 Z"></path>');
  });
});
