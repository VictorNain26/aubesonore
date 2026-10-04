import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import * as m from '@/paraglide/messages.js';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="text-text min-h-dvh">
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
