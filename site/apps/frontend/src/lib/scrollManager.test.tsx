// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { BrowserRouter, useNavigate, type NavigateFunction } from 'react-router';
import { ScrollManager } from './scrollManager';

function Navigator({ onReady }: { onReady: (navigate: NavigateFunction) => void }) {
  const navigate = useNavigate();
  useEffect(() => onReady(navigate), [navigate, onReady]);
  return null;
}

/** The site's scroll, in a browser router, and a way to move between its entries. */
function setup(): { go: (to: string | number) => void } {
  let navigate: NavigateFunction | null = null;
  render(
    <BrowserRouter>
      <ScrollManager />
      <Navigator
        onReady={(n) => {
          navigate = n;
        }}
      />
      <h2 id="albums">Albums</h2>
    </BrowserRouter>
  );
  return {
    go: (to) =>
      act(() => {
        if (typeof to === 'number') void navigate?.(to);
        else void navigate?.(to);
      }),
  };
}

let pageHeight = 4_000;
let resized: ResizeObserverCallback = () => undefined;
const scrolls: number[] = [];

function setScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  window.dispatchEvent(new Event('scroll'));
}

/** Lets the scroll listener's frame run and the browser's popstate arrive. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  scrolls.length = 0;
  pageHeight = 4_000;
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get: () => pageHeight,
  });
  vi.stubGlobal('scrollTo', (options: ScrollToOptions) => {
    scrolls.push(options.top ?? 0);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: options.top ?? 0 });
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('one scroll for every page', () => {
  it('opens a new page at the top, wherever the last one was read', async () => {
    const { go } = setup();
    setScroll(1_800);
    await settle();

    go('/mentions-legales');

    expect(scrolls.at(-1)).toBe(0);
  });

  it('opens a link to an anchor at it', () => {
    const { go } = setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    go('/artiste/air#albums');

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('puts the reader back where they were on back, once the page is tall enough again', async () => {
    const { go } = setup();
    setScroll(1_800);
    await settle();
    go('/mentions-legales');
    // The page comes back short, its content still on its way.
    pageHeight = 1_000;

    go(-1);
    await settle();
    expect(scrolls.at(-1)).toBe(0);

    pageHeight = 4_000;
    act(() => resized([], {} as ResizeObserver));
    expect(scrolls.at(-1)).toBe(1_800);
  });

  it('leaves the reader where they scroll while the page comes back', async () => {
    const { go } = setup();
    setScroll(1_800);
    await settle();
    go('/mentions-legales');
    pageHeight = 1_000;
    go(-1);
    await settle();

    window.dispatchEvent(new Event('wheel'));
    pageHeight = 4_000;
    act(() => resized([], {} as ResizeObserver));

    expect(scrolls).not.toContain(1_800);
  });
});
