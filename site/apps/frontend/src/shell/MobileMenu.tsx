import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Link, useLocation } from 'react-router';
import { CloseIcon } from '../design/icons';
import { cn } from '@/lib/utils';
import { Logo } from '../design/Logo';
import { localizeHref } from '@/paraglide/runtime.js';
import { useAuthStore } from '../stores/authStore';
import { useLocale, useSwitchLocale } from '../stores/localeStore';
import { ThemeSwitch } from './ThemeSwitch';
import { CLOSE_BUTTON, OUTLINE_ACTION, TEXT_ACTION } from '../design/classes';
import * as m from '@/paraglide/messages.js';

const PAGE_LINK =
  'font-display text-section ease-out-quart focus-visible:outline-accent flex min-h-14 items-center transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 aria-[current=page]:wave-underline';

/**
 * The site's pages on a phone, where the header has no room for them: a Menu button opens them
 * full screen, with the account and the language. The header's logo leads home. Base UI's Dialog brings the focus trap,
 * Escape and the scroll lock.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const locale = useLocale();
  const setLocale = useSwitchLocale();
  const close = () => setOpen(false);

  const pages = [
    { href: localizeHref('/musilogy'), label: m.musilogy_title() },
    user
      ? { href: localizeHref('/mes-titres'), label: m.nav_my_tracks() }
      : { href: localizeHref('/connexion'), label: m.nav_sign_in() },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={OUTLINE_ACTION}>{m.menu_open()}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Popup className="bg-surface text-text ease-out-soft px-page fixed inset-0 z-50 flex flex-col overflow-y-auto pt-5 pb-10 transition-[opacity,translate] duration-300 focus-visible:outline-none data-[ending-style]:-translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-2 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-mark m-0">
              <Logo className="block h-[0.839em]" />
              <span className="sr-only">AubeSonore</span>
            </Dialog.Title>
            <Dialog.Close aria-label={m.close()} className={CLOSE_BUTTON}>
              <CloseIcon className="size-4.5" />
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
                    {...(page.href === localizeHref('/connexion')
                      ? { state: { from: pathname } }
                      : {})}
                    className={PAGE_LINK}
                  >
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="wave-rule-top mt-auto flex flex-col gap-6 pt-6">
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
            <div className="flex flex-wrap items-center justify-between gap-x-6">
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
                      'min-w-11 justify-center',
                      locale === code ? 'font-bold' : 'text-text-muted'
                    )}
                  >
                    {code}
                  </button>
                ))}
              </div>
              <ThemeSwitch className="text-ui" />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
