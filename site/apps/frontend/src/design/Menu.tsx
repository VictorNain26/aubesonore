import type { ReactElement, ReactNode } from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { cn } from '@/lib/utils';

interface MenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  selected?: boolean;
}

export interface MenuProps {
  /** Élément déclencheur (ex. `Button`) auquel le menu se rattache. */
  trigger: ReactElement;
  /** Contenu optionnel affiché en tête du menu (ex. infos utilisateur). */
  header?: ReactNode;
  /** Actions listées ; si une entrée a `selected` défini, le menu devient un groupe radio. */
  items: MenuAction[];
}

const itemClassName =
  'flex h-11 items-center px-4 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface';

/**
 * Menu contextuel basé sur Base UI. Bascule automatiquement en groupe radio dès qu'une
 * entrée porte `selected`, sinon reste une liste d'actions simples.
 */
export function Menu({ trigger, header, items }: MenuProps) {
  const isRadio = items.some((item) => item.selected !== undefined);
  const selectedValue = items.find((item) => item.selected === true)?.label;
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} className="z-60">
          <BaseMenu.Popup className="border-border bg-surface-raised text-body text-text ease-out-quart max-h-72 min-w-44 origin-(--transform-origin) overflow-y-auto rounded-md border py-1 transition-[opacity,scale] duration-150 focus:outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {header ? (
              <BaseMenu.Group className="border-border border-b px-4 py-2">
                <BaseMenu.GroupLabel>{header}</BaseMenu.GroupLabel>
              </BaseMenu.Group>
            ) : null}
            {isRadio ? (
              <BaseMenu.RadioGroup
                value={selectedValue}
                onValueChange={(value) => {
                  items.find((item) => item.label === value)?.onSelect();
                }}
              >
                {items.map((item) => (
                  <BaseMenu.RadioItem
                    key={item.label}
                    value={item.label}
                    disabled={item.disabled}
                    closeOnClick
                    className={cn(
                      itemClassName,
                      'data-[checked]:bg-surface data-[checked]:font-medium'
                    )}
                  >
                    {item.label}
                  </BaseMenu.RadioItem>
                ))}
              </BaseMenu.RadioGroup>
            ) : (
              items.map((item) => (
                <BaseMenu.Item
                  key={item.label}
                  disabled={item.disabled}
                  onClick={item.onSelect}
                  className={itemClassName}
                >
                  {item.label}
                </BaseMenu.Item>
              ))
            )}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
