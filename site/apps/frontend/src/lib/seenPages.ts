// What a page loaded, kept for the tab: back and forward draw it at once,
// at its full height, while it is asked again behind.
const MAX_PAGES = 30;

export function seenStore<V>() {
  const pages = new Map<string, V>();
  return {
    get: (key: string): V | undefined => pages.get(key),
    set: (key: string, value: V) => {
      pages.delete(key);
      pages.set(key, value);
      const oldest = pages.keys().next();
      if (pages.size > MAX_PAGES && !oldest.done) pages.delete(oldest.value);
    },
  };
}
