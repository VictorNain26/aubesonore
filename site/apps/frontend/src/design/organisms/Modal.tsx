import type { ReactNode, RefObject } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';

type ModalVariant = 'center' | 'split';

const POPUP: Record<ModalVariant, string> = {
  center:
    'border-border bg-surface top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border p-6 data-[ending-style]:scale-95 data-[starting-style]:scale-95 starting:scale-95',
  split:
    'bg-surface inset-0 md:grid md:grid-cols-[minmax(0,1fr)_35rem] data-[ending-style]:translate-y-2 data-[starting-style]:translate-y-2 starting:translate-y-2',
};

const CLOSE =
  'ease-out-quart hover:bg-surface-raised focus-visible:outline-accent inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90';

export interface ModalProps {
  /** Titre de la fenêtre (nom accessible du dialogue). */
  title: string;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `center` : petite fenêtre (à propos, erreurs). `split` : plein écran, panneau
   * d'ambiance `aside` à gauche sur grand écran (connexion).
   */
  variant?: ModalVariant;
  /** Panneau d'ambiance de la variante `split`, masqué sur téléphone. */
  aside?: ReactNode;
  /** Élément focalisé à l'ouverture (par défaut : le premier élément focalisable). */
  initialFocus?: RefObject<HTMLElement | null>;
}

export function Modal({
  title,
  children,
  open,
  onOpenChange,
  variant = 'center',
  aside,
  initialFocus,
}: ModalProps) {
  // Base UI sets data-starting-style only when `open` toggles; `starting:`
  // (@starting-style) also lets a dialog mounted already open enter.
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-scrim ease-out-quart fixed inset-0 z-50 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 starting:opacity-0" />
        <Dialog.Popup
          {...(initialFocus ? { initialFocus } : {})}
          className={cn(
            'text-text ease-out-soft fixed z-50 flex flex-col overflow-hidden transition-[opacity,translate,scale] duration-300 focus-visible:outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 starting:opacity-0',
            POPUP[variant]
          )}
        >
          {variant === 'split' ? (
            <>
              <div className="dawn-rise relative hidden flex-col justify-between overflow-hidden p-10 md:flex">
                {aside}
              </div>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-16 md:justify-center md:px-16">
                <Dialog.Close
                  aria-label={m.close()}
                  className={cn(CLOSE, 'absolute top-4 right-4 md:top-6 md:right-6')}
                >
                  <X className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
                </Dialog.Close>
                <div className="max-w-form mx-auto flex w-full flex-col gap-6">
                  <Dialog.Title className="text-section m-0">{title}</Dialog.Title>
                  {children}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <Dialog.Title className="text-title m-0">{title}</Dialog.Title>
                <Dialog.Close aria-label={m.close()} className={CLOSE}>
                  <X className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
                </Dialog.Close>
              </div>
              {children}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
