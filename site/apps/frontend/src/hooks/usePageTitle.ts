import { useEffect } from 'react';

/**
 * The tab says the page while it is shown (« Kraftwerk · AubeSonore »), and gives the title back
 * when the page leaves. null leaves the tab as it is: a page whose name is not known yet.
 */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = `${title} · AubeSonore`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
