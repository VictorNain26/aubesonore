import type { ReactElement, ReactNode } from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { cn } from '@/lib/utils';

interface MenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** Une option parmi plusieurs (ex. le thème), au-dessus des actions. */
interface MenuChoice {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export interface MenuProps {
  /** Élément déclencheur (ex. `Button`) auquel le menu se rattache. */
  trigger: ReactElement;
  /** Contenu optionnel affiché en tête du menu (ex. infos utilisateur). */
  header?: ReactNode;
  /** Un choix exposé en groupe radio nommé, au-dessus des actions. */
  choice?: MenuChoice;
  /** Actions listées. */
  items: MenuAction[];
}

const itemClassName =
  'flex h-11 items-center px-4 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface';

/**
 * Menu contextuel basé sur Base UI : un en-tête, un choix éventuel (groupe radio, le menu reste
 * ouvert pour qu'on en voie l'effet), puis des actions simples.
 */
export function Menu({ trigger, header, choice, items }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} className="z-60">
          <BaseMenu.Popup className="border-border bg-surface-raised text-body text-text ease-out-quart max-h-72 min-w-44 origin-(--transform-origin) overflow-y-auto border py-1 transition-[opacity,scale] duration-150 focus:outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {header ? (
              <BaseMenu.Group className="border-border border-b px-4 py-2">
                <BaseMenu.GroupLabel>{header}</BaseMenu.GroupLabel>
              </BaseMenu.Group>
            ) : null}
            {choice ? (
              <BaseMenu.RadioGroup
                value={choice.value}
                onValueChange={(value: string) => choice.onChange(value)}
                className="border-border border-b py-1"
              >
                <BaseMenu.GroupLabel className="text-small text-text-muted px-4 py-1">
                  {choice.label}
                </BaseMenu.GroupLabel>
                {choice.options.map((option) => (
                  <BaseMenu.RadioItem
                    key={option.value}
                    value={option.value}
                    // The wave alone marks the checked one, as every chosen option of the site.
                    className={(state) => cn(itemClassName, state.checked && 'wave-underline')}
                  >
                    {option.label}
                  </BaseMenu.RadioItem>
                ))}
              </BaseMenu.RadioGroup>
            ) : null}
            {items.map((item) => (
              <BaseMenu.Item
                key={item.label}
                disabled={item.disabled}
                onClick={item.onSelect}
                className={itemClassName}
              >
                {item.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
