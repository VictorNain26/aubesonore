import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariantValue = 'primary' | 'ghost' | 'icon';

const VARIANT_CLASSES: Record<ButtonVariantValue, string> = {
  primary: 'bg-accent text-on-accent hover:opacity-90 h-12 px-6',
  ghost: 'text-text hover:bg-surface-raised h-12 px-4',
  icon: 'size-11 justify-center p-0 text-text hover:bg-surface-raised',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `primary` and `ghost` are 48 px high, a form's; `icon` is a 44 px square,
   *  icon-only button. */
  variant?: ButtonVariantValue;
  /** Show a spinner and disable interaction while an action is in flight. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Primary action button. Three variants (`primary`, `ghost`, `icon`) sharing one
 * base: a 48 or 44 px target, focus-visible ring, `active`/`disabled` states, and a
 * built-in `loading` spinner that also disables the button.
 */
export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        'text-body ease-out-quart inline-flex items-center gap-2 font-semibold transition-opacity duration-150',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        'active:opacity-80 disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
