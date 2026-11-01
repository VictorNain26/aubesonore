import { useId } from 'react';
import { cn } from '@/lib/utils';
import { THEME_CHOICES, type ThemeChoice } from '../design/theme';
import { chooseTheme, useThemeChoice } from '../stores/themeStore';
import * as m from '@/paraglide/messages.js';

/** The three themes, in the listener's language: the switch's and the account menu's. */
export function themeOptions(): { value: ThemeChoice; label: string }[] {
  const labels = { system: m.theme_system(), light: m.theme_light(), dark: m.theme_dark() };
  return THEME_CHOICES.map((value) => ({ value, label: labels[value] }));
}

export interface ThemeSwitchViewProps {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  /** The size of the words, the language switch's beside it. */
  className?: string | undefined;
}

/**
 * The theme, written as words, set like the language switch: the current one has the wave under
 * it, and nothing else sets it apart (no weight, ink or underline, so nothing beside it moves). Real radios, hidden behind their words, so the arrow keys and screen readers know
 * it as one choice; each switch its own group (useId), as the footer and the menu both show one.
 */
export function ThemeSwitchView({ choice, onChange, className }: ThemeSwitchViewProps) {
  const name = useId();
  return (
    <span
      role="radiogroup"
      aria-label={m.theme_label()}
      className={cn('text-small flex items-center gap-1', className)}
    >
      {themeOptions().map(({ value, label }, i) => (
        <span key={value} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden="true">/</span> : null}
          <label
            className={cn(
              'ease-out-quart has-focus-visible:outline-accent inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center transition-opacity duration-150 hover:opacity-70 active:opacity-70 has-focus-visible:outline-2 md:min-w-8',
              choice === value && 'wave-underline'
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={choice === value}
              onChange={() => onChange(value)}
              className="sr-only"
            />
            {label}
          </label>
        </span>
      ))}
    </span>
  );
}

export function ThemeSwitch({ className }: { className?: string | undefined }) {
  return <ThemeSwitchView choice={useThemeChoice()} onChange={chooseTheme} className={className} />;
}
