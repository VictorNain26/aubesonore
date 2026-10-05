import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../stores/authStore';
import { Menu } from '../design/molecules/Menu';
import { MobileMenu } from './MobileMenu';
import { Link, useLocation } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';

const NAV_LINK =
  'text-ui ease-out-quart focus-visible:outline-accent hidden min-h-11 items-center rounded-sm transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-97 md:inline-flex';

const BRAND_LINK =
  'ease-out-quart focus-visible:outline-accent flex flex-col gap-1.5 rounded-sm transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4';

const OUTLINE_PILL =
  'text-ui border-accent ease-out-quart hover:bg-accent hover:text-on-accent focus-visible:outline-accent inline-flex min-h-11 items-center rounded-full border px-4.5 transition-[color,background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-97';

const AVATAR =
  'bg-accent text-on-accent ease-out-quart focus-visible:outline-accent flex size-11 items-center justify-center rounded-full font-semibold transition-[scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95';

export function SiteHeader() {
  const { isAuthenticated, isLoading, user, signOut } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      isLoading: s.isLoading,
      user: s.user,
      signOut: s.signOut,
    }))
  );
  const { pathname } = useLocation();
  const isHome = ['/', '/en', '/en/'].includes(pathname);
  // The sign-in page is where Se connecter leads: the header does not offer it twice.
  const isSignInPage = [m.signin_href(), '/reset-password'].includes(pathname);
  const libraryHref = localizeHref('/mes-titres');

  // The same link on every page; on the home page it is also the page's heading.
  const brand = (
    <Link to={localizeHref('/')} className={BRAND_LINK}>
      <span className="text-mark condensed">aubesonore</span>
      <span className="sr-only">, </span>
      <span className="text-sub text-text-muted font-normal text-balance">{m.hero_title()}</span>
    </Link>
  );

  return (
    <header className="px-page relative z-10 flex items-start justify-between gap-6 pt-5 md:pt-7">
      {isHome ? <h1 className="m-0">{brand}</h1> : brand}
      {/* Phones get the pages in a menu: the header has no room for them. */}
      <span className="shrink-0 md:hidden">
        <MobileMenu />
      </span>
      <nav aria-label={m.nav_label()} className="hidden shrink-0 items-center gap-7 md:flex">
        <Link to={localizeHref('/musilogy')} className={NAV_LINK}>
          {m.musilogy_title()}
        </Link>
        {isLoading ? (
          <span aria-hidden="true" className="bg-surface-raised h-11 w-32 rounded-full" />
        ) : isAuthenticated && user ? (
          <span className="flex items-center gap-3">
            <Link
              to={libraryHref}
              aria-current={pathname === libraryHref ? 'page' : undefined}
              className={OUTLINE_PILL}
            >
              {m.nav_my_tracks()}
            </Link>
            <Menu
              trigger={
                <button type="button" aria-label={m.account_label()} className={AVATAR}>
                  {(user.name?.charAt(0) || user.email.charAt(0)).toUpperCase()}
                </button>
              }
              header={
                <span className="flex flex-col py-1">
                  <span className="text-ui font-semibold">
                    {user.name || m.header_user_fallback()}
                  </span>
                  <span className="text-caption text-text-muted">{user.email}</span>
                </span>
              }
              items={[{ label: m.library_sign_out(), onSelect: () => void signOut() }]}
            />
          </span>
        ) : isSignInPage ? null : (
          <Link to={m.signin_href()} state={{ from: pathname }} className={OUTLINE_PILL}>
            {m.nav_sign_in()}
          </Link>
        )}
      </nav>
    </header>
  );
}
