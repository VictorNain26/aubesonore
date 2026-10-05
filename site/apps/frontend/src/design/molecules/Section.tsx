import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A section of a page: its title and intro in the title column (4 parts of 12 where the screen is wide, tokens.css; stacked on phones and upright tablets), its
 * content in the other 8. Its id is an anchor (PageNav). `sticky` keeps the title in view beside
 * long content, as « Depuis l'aube » does on the home page.
 */
export function Section({
  id,
  title,
  body,
  sticky = false,
  children,
}: {
  id: string;
  title: string;
  body?: string;
  sticky?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="wide:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] wide:gap-16 grid scroll-mt-10 gap-6"
    >
      <div
        className={cn(
          'reveal flex flex-col gap-2 self-start md:gap-3',
          sticky && 'wide:sticky wide:top-10'
        )}
      >
        <h2 id={`${id}-title`} className="text-section m-0">
          {title}
        </h2>
        {body ? <p className="text-intro text-text-muted max-w-blurb m-0">{body}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}
