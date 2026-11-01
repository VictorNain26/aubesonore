import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../stores/authStore';
import { Menu } from '../design/Menu';
import { Logo } from '../design/Logo';
import { MobileMenu } from './MobileMenu';
import { Link, useLocation } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';
import { useHeaderOnScroll } from '../lib/headerOnScroll';
import { OUTLINE_ACTION } from '../design/classes';
import { THEME_CHOICES } from '../design/theme';
import { chooseTheme, useThemeChoice } from '../stores/themeStore';
import { themeOptions } from './ThemeSwitch';

const NAV_LINK =
  'text-body ease-out-quart focus-visible:outline-accent hidden min-h-11 items-center transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-97 md:inline-flex';

// The padding makes a 44 px target of the lockup (21 px on a phone, 25 wider); the margin keeps the
// header's layout.
const BRAND_LINK =
  'focus-visible:outline-accent -my-3 flex py-3 focus-visible:outline-2 focus-visible:outline-offset-4';

// The page the listener is on, Musilogy or Mes titres alike: underlined with the line, not hidden,
// and not reacting to the pointer.
const CURRENT_LINK = 'wave-underline hover:opacity-100';

const AVATAR =
  'bg-accent text-on-accent ease-out-quart focus-visible:outline-accent flex size-11 items-center justify-center rounded-full font-semibold transition-[scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95';

/**
 * The site's header on every page: the name, which leads home, and the pages. On the home page
 * (`tagline`) the station's line stands beside the name, under it on a phone, as the page's one
 * heading: it names the page and holds still, where the title on air changes every few minutes.
 */
export function SiteHeader({ tagline = false }: { tagline?: boolean }) {
  const { isAuthenticated, isLoading, user, signOut } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      isLoading: s.isLoading,
      user: s.user,
      signOut: s.signOut,
    }))
  );
  const theme = useThemeChoice();
  const { pathname } = useLocation();
  // The sign-in page is where Se connecter leads: the header does not offer it twice.
  const isSignInPage = [localizeHref('/connexion'), '/reset-password'].includes(pathname);
  const libraryHref = localizeHref('/mes-titres');
  const musilogyHref = localizeHref('/musilogy');
  const onMusilogy = pathname === musilogyHref || pathname.startsWith(`${musilogyHref}/`);
  const onLibrary = pathname === libraryHref;
  // At rest in the page's flow; out of it, hidden while the page goes down, back when it goes up.
  const { slot, onFocus, state, slides, height } = useHeaderOnScroll();
  const atRest = state === 'rest';

  // The same link on every page, never a heading: each page names itself (the home page with its
  // line, beside the link).
  const link = (
    <Link to={localizeHref('/')} className={BRAND_LINK}>
      {/* Under 22rem the mark is drawn a touch smaller, so Menu keeps the page's right gutter. */}
      <Logo intro className="text-mark h-[0.839em] max-[22rem]:h-[0.824em]" />
      <span className="sr-only">AubeSonore</span>
    </Link>
  );
  const brand = tagline ? (
    <span className="flex min-w-0 flex-col gap-0.75 md:flex-row md:items-baseline md:gap-3.5">
      {link}
      {/* At rest only: the header back over the page stays one compact row. The page's heading
          all the same, for screen readers. */}
      <h1
        className={cn(
          'font-display text-small md:text-line text-text-muted m-0 font-normal italic',
          !atRest && 'sr-only'
        )}
      >
        {m.hero_title()}
      </h1>
    </span>
  ) : (
    link
  );

  return (
    <div ref={slot} style={height === null ? undefined : { height }}>
      <header
        onFocus={onFocus}
        className={cn(
          'px-page relative z-10 flex items-center justify-between gap-6 pt-4 md:pt-7',
          !atRest && 'bg-surface border-border fixed inset-x-0 top-0 z-30 border-b py-3 md:py-3',
          state === 'hidden' && '-translate-y-full',
          slides && 'ease-out-quart motion-safe:transition-transform motion-safe:duration-300'
        )}
      >
        {brand}
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
            <span aria-hidden="true" className="bg-surface-raised h-11 w-32" />
          ) : isAuthenticated && user ? (
            <span className="flex items-center gap-7">
              <Link
                to={libraryHref}
                aria-current={onLibrary ? 'page' : undefined}
                className={cn(NAV_LINK, onLibrary && CURRENT_LINK)}
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
                    <span className="text-body font-semibold">
                      {user.name || m.header_user_fallback()}
                    </span>
                    <span className="text-small text-text-muted">{user.email}</span>
                  </span>
                }
                // The footer's theme switch, here as the menu's own radio items.
                choice={{
                  label: m.theme_label(),
                  value: theme,
                  options: themeOptions(),
                  onChange: (value) => {
                    const choice = THEME_CHOICES.find((c) => c === value);
                    if (choice) chooseTheme(choice);
                  },
                }}
                items={[{ label: m.library_sign_out(), onSelect: () => void signOut() }]}
              />
            </span>
          ) : isSignInPage ? null : (
            <Link
              to={localizeHref('/connexion')}
              state={{ from: pathname }}
              className={OUTLINE_ACTION}
            >
              {m.nav_sign_in()}
            </Link>
          )}
        </nav>
      </header>
    </div>
  );
}
