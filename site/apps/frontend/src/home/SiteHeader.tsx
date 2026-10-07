import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../stores/authStore';
import { Menu } from '../design/molecules/Menu';
import { Logo } from '../design/atoms/Logo';
import { MobileMenu } from './MobileMenu';
import { Link, useLocation } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';
import { useHeaderOnScroll } from '../lib/headerOnScroll';

const NAV_LINK =
  'text-ui ease-out-quart focus-visible:outline-accent hidden min-h-11 items-center rounded-sm transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-97 md:inline-flex';

const BRAND_LINK =
  'focus-visible:outline-accent flex flex-col gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4';

const OUTLINE_PILL =
  'text-ui border-accent ease-out-quart hover:bg-accent hover:text-on-accent focus-visible:outline-accent inline-flex min-h-11 items-center rounded-full border px-4.5 transition-[color,background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-97';

// The page the listener is on: marked, not hidden, and not reacting to the pointer.
const CURRENT_LINK = 'underline decoration-2 underline-offset-8 hover:opacity-100';
const CURRENT_PILL = 'bg-accent text-on-accent';

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
  const musilogyHref = localizeHref('/musilogy');
  const onMusilogy = pathname === musilogyHref || pathname.startsWith(`${musilogyHref}/`);
  const onLibrary = pathname === libraryHref;
  // At rest in the page's flow; out of it, hidden while the page goes down, back when it goes up.
  const { slot, onFocus, state, slides, height } = useHeaderOnScroll();
  const atRest = state === 'rest';

  // The same link on every page; on the home page it is also the page's heading.
  const brand = (
    <Link to={localizeHref('/')} className={BRAND_LINK}>
      {/* Under 22rem the lockup steps down a size, so Menu keeps the page's right gutter. */}
      <Logo intro className="text-mark max-[22rem]:text-title h-[0.795em] self-start" />
      <span className="sr-only">AubeSonore, </span>
      {/* On phones the line costs two rows above Écouter: it stays in the link's name only. */}
      <span
        className={cn(
          'text-sub text-text-muted sr-only font-normal text-balance',
          // Back over the page, the header keeps to one line.
          atRest && 'md:not-sr-only'
        )}
      >
        {m.hero_title()}
      </span>
    </Link>
  );

  return (
    <div ref={slot} style={height === null ? undefined : { height }}>
      <header
        onFocus={onFocus}
        className={cn(
          'px-page relative z-10 flex items-center justify-between gap-6 pt-4 md:items-start md:pt-7',
          !atRest &&
            'bg-surface border-border fixed inset-x-0 top-0 z-30 border-b py-3 md:items-center md:py-3',
          state === 'hidden' && '-translate-y-full',
          slides && 'ease-out-quart motion-safe:transition-transform motion-safe:duration-300'
        )}
      >
        {isHome ? <h1 className="m-0">{brand}</h1> : brand}
        {/* Phones get the pages in a menu: the header has no room for them. */}
        <span className="shrink-0 md:hidden">
          <MobileMenu />
        </span>
        <nav aria-label={m.nav_label()} className="hidden shrink-0 items-center gap-7 md:flex">
          <Link
            to={musilogyHref}
            aria-current={onMusilogy ? 'page' : undefined}
            className={cn(NAV_LINK, onMusilogy && CURRENT_LINK)}
          >
            {m.musilogy_title()}
          </Link>
          {isLoading ? (
            <span aria-hidden="true" className="bg-surface-raised h-11 w-32 rounded-full" />
          ) : isAuthenticated && user ? (
            <span className="flex items-center gap-3">
              <Link
                to={libraryHref}
                aria-current={onLibrary ? 'page' : undefined}
                className={cn(OUTLINE_PILL, onLibrary && CURRENT_PILL)}
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
    </div>
  );
}
