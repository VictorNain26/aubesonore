// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from './usePageTitle';

afterEach(() => {
  document.title = '';
});

describe('usePageTitle', () => {
  it('names the page in the tab while it is shown, then gives the title back', () => {
    document.title = 'AubeSonore · Radio de découverte';
    const { unmount, rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: 'Kraftwerk' },
    });
    expect(document.title).toBe('Kraftwerk · AubeSonore');

    rerender({ title: 'Neu!' });
    expect(document.title).toBe('Neu! · AubeSonore');

    unmount();
    expect(document.title).toBe('AubeSonore · Radio de découverte');
  });

  it('leaves the tab alone while the name is not known', () => {
    document.title = 'AubeSonore';
    renderHook(() => usePageTitle(null));
    expect(document.title).toBe('AubeSonore');
  });
});
