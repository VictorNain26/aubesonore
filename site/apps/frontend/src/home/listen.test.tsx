// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListenDisc, listenAria, listenLabel, type ListenState } from './listen';

// The disc is aria-hidden: the tests read the markup a wrapper holds.
const markup = (state: ListenState) => {
  render(
    <span data-testid="disc">
      <ListenDisc state={state} />
    </span>
  );
  return screen.getByTestId('disc').innerHTML;
};

describe('ListenDisc', () => {
  it('draws Écouter as a triangle in a line, not a filled one', () => {
    expect(markup('idle')).toMatch(/<path d="M7 5.2 L15.5 10 L7 14.8 Z" fill="none" stroke=/);
  });

  it('offers a square to stop the live, never the two bars of a pause it does not have', () => {
    const html = markup('playing');
    expect(html.match(/<rect /g)).toHaveLength(1);
    expect(html).toMatch(/<rect [^>]*width="9" height="9"[^>]* fill="none"/);
  });
});

describe('listen labels', () => {
  it('names a press on a live that plays or connects « Arrêter »', () => {
    expect(listenLabel('idle')).toBe('Écouter');
    expect(listenLabel('playing')).toBe('Arrêter');
    expect(listenLabel('connecting')).toBe('Arrêter');
    expect(listenAria('idle')).toBe('Écouter le direct');
    expect(listenAria('playing')).toBe('Arrêter le direct');
  });
});
