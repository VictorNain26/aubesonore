import * as m from '@/paraglide/messages.js';
import { TEXT_ACTION } from '../../home/styles';

export interface PageNavItem {
  /** The id of a Section on the page. */
  id: string;
  label: string;
}

/** The sections a long page holds, as anchors: one tap to the albums, the close artists, the bands. */
export function PageNav({ items }: { items: readonly PageNavItem[] }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label={m.page_nav_label()}>
      {/* One row on phones, scrolling sideways past the gutter like Les plus gardés; wraps from md. */}
      <ul className="m-0 -mx-6 flex scrollbar-none list-none gap-x-6 overflow-x-auto p-0 px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <a href={`#${item.id}`} className={`${TEXT_ACTION} text-text-muted hover:text-text`}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
