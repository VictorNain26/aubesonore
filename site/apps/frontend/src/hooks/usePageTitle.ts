import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * What the tab says, from two sources: the page shown, and the track while it plays. Each says
 * its own; the tab is written in one place, the track first (useful from another tab). Two effects
 * that each saved and gave back document.title undid each other's (a page left behind, an old
 * track).
 */
export const useTabTitle = create<{ page: string | null; track: string | null }>(() => ({
  page: null,
  track: null,
}));

if (typeof document !== 'undefined') {
  useTabTitle.subscribe(({ page, track }) => {
    const title = track ?? page;
    if (title !== null) document.title = title;
  });
}

/**
 * The tab says `title` whole while the page is shown. null leaves the tab as it is: a page whose
 * name is not known yet. The home page names the site this way; other pages go through
 * usePageTitle.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    useTabTitle.setState({ page: title });
    return () => {
      // The next page says its own name, once this one has left.
      if (useTabTitle.getState().page === title) useTabTitle.setState({ page: null });
    };
  }, [title]);
}

/** The tab says the page while it is shown (« Kraftwerk · AubeSonore »). */
export function usePageTitle(title: string | null): void {
  useDocumentTitle(title === null ? null : `${title} · AubeSonore`);
}
