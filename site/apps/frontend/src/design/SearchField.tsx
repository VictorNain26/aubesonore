import { useRef, type Ref } from 'react';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { CloseIcon, SearchIcon } from './icons';

/**
 * The site's one search field (Musilogy, Mes titres): an ink underline like TextField's, at a right
 * angle, thickening under the focus; the loupe before the words, a clear button after them once
 * something is typed. Échap clears it too.
 */
export function SearchField({
  label,
  placeholder,
  query,
  onQueryChange,
  onType,
  onFocus,
  ref,
  large = false,
  className,
}: {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** A letter typed (not a clearing): Musilogy lifts the field above a phone's keyboard then. */
  onType?: (() => void) | undefined;
  onFocus?: () => void;
  /** The search landmark around the field. */
  ref?: Ref<HTMLDivElement>;
  /** The page's one action (Musilogy): the words larger, the field taller (56 px, 48 else). */
  large?: boolean;
  className?: string;
}) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <div ref={ref} role="search" className={cn('relative w-full', className)}>
      <label>
        <span className="sr-only">{label}</span>
        <SearchIcon
          className={cn(
            'text-text-muted pointer-events-none absolute top-1/2 left-0 -translate-y-1/2',
            large ? 'size-6' : 'size-5'
          )}
        />
        <input
          ref={field}
          type="search"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            onType?.();
          }}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onQueryChange('');
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            'border-accent ease-out-quart placeholder:text-text-faint autofill-paper w-full rounded-none border-0 border-b bg-transparent font-normal transition-[border-width,background-color] duration-150 hover:border-b-2 focus-visible:border-b-2 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden',
            large ? 'text-heading h-14 pl-10' : 'text-line h-12 pl-8 font-semibold',
            // The clear button's room is kept only while it shows: a phone needs it for the placeholder.
            query ? 'pr-12' : 'pr-0'
          )}
        />
      </label>
      {query ? (
        <button
          type="button"
          onClick={() => {
            onQueryChange('');
            // The button leaves with the words: the focus goes back to the field, not the page.
            field.current?.focus();
          }}
          aria-label={m.library_search_clear()}
          className="ease-out-quart focus-visible:outline-accent absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90"
        >
          <CloseIcon className="size-4.5" />
        </button>
      ) : null}
    </div>
  );
}
