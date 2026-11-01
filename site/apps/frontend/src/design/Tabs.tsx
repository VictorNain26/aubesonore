import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Tab {
  /** Unique among the tabs: the tab's and its panel's ids derive from it. */
  id: string;
  label: string;
  panel: ReactNode;
}

const STEP: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * Tabs, by the WAI-ARIA Authoring Practices' pattern with automatic activation: a panel shows as
 * soon as its tab has the focus, since every panel is already drawn. One tab in the page's Tab
 * order, the arrows, Home and End move between them (w3.org/WAI/ARIA/apg/patterns/tabs). The
 * other panels stay in the page, hidden, so that their links are there.
 */
export function Tabs({
  label,
  tabs,
  selected,
  onSelect,
}: {
  label: string;
  tabs: readonly Tab[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // Two tab sets on one page never share an id.
  const prefix = useId();

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const next = tabs[step(index, tabs.length)];
    if (!next) return;
    onSelect(next.id);
    buttons.current.get(next.id)?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* One row on phones, scrolling sideways past the gutter like PageNav. */}
      <div
        role="tablist"
        aria-label={label}
        className="-mx-6 flex scrollbar-none gap-x-8 overflow-x-auto px-6 md:mx-0 md:px-0"
      >
        {tabs.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(button) => {
                if (button) buttons.current.set(tab.id, button);
                else buttons.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${prefix}tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${prefix}panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'text-line ease-out-quart focus-visible:outline-accent inline-flex min-h-11 shrink-0 items-center font-semibold whitespace-nowrap transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70',
                // The wave alone says which: no weight, ink or underline sets it apart.
                isSelected && 'wave-underline'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${prefix}panel-${tab.id}`}
          aria-labelledby={`${prefix}tab-${tab.id}`}
          hidden={tab.id !== selected}
          // Focusable, so that a keyboard reaches a panel whose first content is not a link.
          tabIndex={0}
          className="focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
