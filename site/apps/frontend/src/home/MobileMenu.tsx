import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Link, useLocation } from 'react-router';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '../design/atoms/Logo';
import { localizeHref } from '@/paraglide/runtime.js';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';
import { TEXT_ACTION } from './styles';
import * as m from '@/paraglide/messages.js';

const TRIGGER =
  'text-ui border-accent ease-out-quart hover:bg-accent hover:text-on-accent focus-visible:outline-accent inline-flex min-h-11 items-center rounded-full border px-4.5 transition-[color,background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-97';

const PAGE_LINK =
  'text-section ease-out-quart focus-visible:outline-accent flex min-h-14 items-center rounded-sm transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8';

const CLOSE =
  'ease-out-quart hover:bg-surface-raised focus-visible:outline-accent inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90';

/**
 * The site's pages on a phone, where the header has no room for them: a Menu button opens them
 * full screen, with the account and the language. Base UI's Dialog brings the focus trap,
 * Escape and the scroll lock.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const close = () => setOpen(false);

  const pages = [
    { href: localizeHref('/'), label: m.nav_live() },
    { href: localizeHref('/musilogy'), label: m.musilogy_title() },
    user
      ? { href: localizeHref('/mes-titres'), label: m.nav_my_tracks() }
      : { href: m.signin_href(), label: m.nav_sign_in() },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={TRIGGER}>{m.menu_open()}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Popup className="bg-surface text-text ease-out-soft px-page fixed inset-0 z-50 flex flex-col overflow-y-auto pt-5 pb-10 transition-[opacity,translate] duration-300 focus-visible:outline-none data-[ending-style]:-translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-2 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-mark m-0">
              <Logo className="block h-[0.795em]" />
              <span className="sr-only">AubeSonore</span>
            </Dialog.Title>
            <Dialog.Close aria-label={m.close()} className={CLOSE}>
              <X className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <nav aria-label={m.nav_label()} className="mt-12">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {pages.map((page) => (
                <li key={page.href}>
                  <Link
                    to={page.href}
                    onClick={close}
                    aria-current={pathname === page.href ? 'page' : undefined}
                    {...(page.href === m.signin_href() ? { state: { from: pathname } } : {})}
                    className={PAGE_LINK}
                  >
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-border mt-auto flex flex-col gap-6 border-t pt-6">
            {user ? (
              <div className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 flex-col">
                  <span className="text-ui truncate font-semibold">
                    {user.name || m.header_user_fallback()}
                  </span>
                  <span className="text-caption text-text-muted truncate">{user.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void signOut();
                  }}
                  className={TEXT_ACTION}
                >
                  {m.library_sign_out()}
                </button>
              </div>
            ) : null}
            <div role="group" aria-label={m.footer_language()} className="flex gap-2">
              {(['fr', 'en'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  onClick={() => setLocale(code)}
                  aria-pressed={locale === code}
                  className={cn(
                    TEXT_ACTION,
                    'min-w-11 justify-center font-mono uppercase',
                    locale === code ? 'font-bold' : 'text-text-muted'
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
