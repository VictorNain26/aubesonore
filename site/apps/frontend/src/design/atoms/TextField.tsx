import type { ComponentProps, ReactNode } from 'react';
import { Field } from '@base-ui/react/field';
import { cn } from '@/lib/utils';

export interface TextFieldProps extends ComponentProps<typeof Field.Control> {
  /** Libellé affiché au-dessus du champ. */
  label: string;
  /** Message d'erreur ; sa présence bascule le champ en état invalide. */
  error?: string | undefined;
  /** Contenu affiché en overlay à droite du champ (icône, bouton…). */
  trailing?: ReactNode;
}

/**
 * Champ de texte avec libellé, état d'erreur et zone `trailing` optionnelle,
 * construit sur `Field` de Base UI.
 */
export function TextField({ label, error, trailing, className, ...props }: TextFieldProps) {
  return (
    <Field.Root invalid={error !== undefined} className="flex w-full flex-col gap-1.5">
      <Field.Label className="text-ui">{label}</Field.Label>
      <div className="relative">
        <Field.Control
          className={cn(
            'border-accent text-sub text-text h-13 w-full rounded-none border-0 border-b bg-transparent px-0',
            'ease-out-quart placeholder:text-text-faint transition-[border-width,color] duration-150',
            // Focus thickens the ink underline instead of drawing a box around the field.
            'focus-visible:border-b-2 focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-50',
            error !== undefined && 'border-b-2',
            trailing !== undefined && 'pr-11',
            className
          )}
          {...props}
        />
        {trailing !== undefined ? (
          <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>
        ) : null}
      </div>
      {error !== undefined ? (
        <Field.Error className="text-caption text-text font-medium" match>
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}
