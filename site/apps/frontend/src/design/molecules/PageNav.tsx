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
      <ul className="m-0 flex list-none flex-wrap gap-x-6 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={`${TEXT_ACTION} text-text-muted hover:text-text`}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
