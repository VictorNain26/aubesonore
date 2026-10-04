import type { ReactNode } from 'react';

/**
 * A section of a page: its title and intro in the title column (4 parts of 12 from 768px), its
 * content in the other 8.
 */
export function Section({
  id,
  title,
  body,
  children,
}: {
  id: string;
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16"
    >
      <div className="reveal-heading flex flex-col gap-2 self-start md:gap-3">
        <h2 id={`${id}-title`} className="text-section m-0">
          {title}
        </h2>
        {body ? <p className="text-intro text-text-muted max-w-blurb m-0">{body}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}
