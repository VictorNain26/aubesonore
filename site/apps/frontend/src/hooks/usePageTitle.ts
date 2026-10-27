import { useEffect } from 'react';

/**
 * The tab says `title` whole while the page is shown, and gives the previous title back when the
 * page leaves. null leaves the tab as it is. The home page names the site this way; other pages go
 * through usePageTitle.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * The tab says the page while it is shown (« Kraftwerk · AubeSonore »), and gives the title back
 * when the page leaves. null leaves the tab as it is: a page whose name is not known yet.
 */
export function usePageTitle(title: string | null): void {
  useDocumentTitle(title === null ? null : `${title} · AubeSonore`);
}
