import type { ReactNode } from 'react';

/**
 * A section of the artist page: its title above its content, across the page's width, and how
 * many it holds beside the title when that says something (the albums and EPs). Its id is an
 * anchor (PageNav).
 */
export function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-10 flex-col gap-5">
      <div className="reveal flex items-baseline gap-3.5">
        <h2 id={`${id}-title`} className="font-display text-title m-0">
          {title}
        </h2>
        {count === undefined ? null : (
          <span className="text-body text-text-muted font-normal">{count}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}
