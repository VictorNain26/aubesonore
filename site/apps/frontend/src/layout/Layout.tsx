import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { useAuthModalStore } from '../stores/authModalStore';
import { toastError } from '../lib/appToast';
import * as m from '@/paraglide/messages.js';

interface LayoutProps {
  children: ReactNode;
}

function readResetTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.location.pathname !== '/reset-password') return null;
  return new URLSearchParams(window.location.search).get('token');
}

export default function Layout({ children }: LayoutProps) {
  const openAuthModal = useAuthModalStore((s) => s.open);

  // Better Auth's forget-password emails redirect to /reset-password?token=XXX
  // (or ?error=INVALID_TOKEN). Open the modal in reset mode on first paint
  // via the global store, then clean the URL so a refresh doesn't replay it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/reset-password') return;

    const error = new URLSearchParams(window.location.search).get('error');
    if (error === 'INVALID_TOKEN') {
      toastError(m.toast_reset_link_invalid());
    }

    const token = readResetTokenFromUrl();
    if (token) {
      openAuthModal({ resetToken: token });
    }

    window.history.replaceState({}, '', '/');
  }, [openAuthModal]);

  return (
    <div className="text-text pb-bar min-h-dvh">
      <a href="#main" className="skip-link">
        {m.skip_link()}
      </a>
      {children}
      <Toaster
        position="top-center"
        duration={3000}
        toastOptions={{
          classNames: {
            toast: '!bg-accent !text-on-accent !border-0 !text-ui !rounded-full',
            description: '!text-on-accent-muted',
            actionButton: '!bg-surface !text-text',
          },
        }}
      />
    </div>
  );
}
