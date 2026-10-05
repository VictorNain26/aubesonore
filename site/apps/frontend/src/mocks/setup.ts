import '@testing-library/jest-dom/vitest';

import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// jsdom has no pointer capture; sonner captures the pointer when a toast is pressed.
if (typeof Element !== 'undefined' && !('setPointerCapture' in Element.prototype)) {
  Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} });
}

if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom annonce navigator.languages = ['en-US'] : la stratégie
// preferredLanguage résoudrait 'en' et casserait les assertions FR.
// Le pin est doublé sur navigator.languages car certains tests vident
// localStorage dans leur beforeEach (le pin localStorage serait perdu).
if (typeof localStorage !== 'undefined') {
  localStorage.setItem('PARAGLIDE_LOCALE', 'fr');
}
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'languages', { value: ['fr'], configurable: true });
}

// En environnement node, localStorage n'existe pas : un test qui stubbe
// `window` fait passer setLocale de paraglide par le chemin navigateur,
// qui lèverait une ReferenceError. Miroir en mémoire minimal.
if (typeof globalThis.localStorage === 'undefined') {
  const backing = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, String(value)),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: () => null,
    get length() {
      return backing.size;
    },
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
