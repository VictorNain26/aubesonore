import { Mail } from 'lucide-react';
import { Modal } from './Modal';
import * as m from '@/paraglide/messages.js';

interface AboutModalProps {
  /** Whether the modal is currently shown. */
  isOpen: boolean;
  /** Called when the modal requests to close (backdrop, escape, close button). */
  onClose: () => void;
}

/**
 * Static "about" modal presenting AubeSonore and a contact email.
 */
export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  return (
    <Modal title="AubeSonore" open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <div className="space-y-5">
        <p className="text-body text-text-muted">{m.about_body()}</p>
        <div className="text-caption text-text-faint flex items-center gap-2">
          <Mail className="size-4 shrink-0" />
          <a
            href="mailto:contact@aubesonore.fr"
            className="text-text underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            contact@aubesonore.fr
          </a>
        </div>
      </div>
    </Modal>
  );
}
