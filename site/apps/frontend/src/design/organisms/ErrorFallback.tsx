import { useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { Button } from '../atoms/Button';
import { Modal } from './Modal';
import * as m from '@/paraglide/messages.js';

interface ModalErrorFallbackProps extends FallbackProps {
  /** Called after the fallback modal is dismissed, on top of closing itself. */
  onClose: () => void;
}

/**
 * Error boundary fallback for content shown in a modal. Self-manages its
 * `open` state so it can close before notifying the parent via `onClose`.
 */
export function ModalErrorFallback({ onClose }: ModalErrorFallbackProps) {
  const [isOpen, setIsOpen] = useState(true);
  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };
  return (
    <Modal title={m.error_generic()} open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <div role="alert" className="text-center">
        <p className="text-body text-text-muted">{m.error_modal_body()}</p>
        <Button variant="primary" onClick={handleClose} className="mt-4">
          {m.close()}
        </Button>
      </div>
    </Modal>
  );
}
