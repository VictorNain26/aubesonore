import { lazy, Suspense, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ErrorBoundary } from 'react-error-boundary';
import { useAuthStore } from '../stores/authStore';
import { useAuthModalStore } from '../stores/authModalStore';
import { ModalErrorFallback } from '../design/organisms/ErrorFallback';
import { Menu } from '../design/molecules/Menu';
import { Link } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';

const LikedTracksModal = lazy(() =>
  import('../components/LikedTracksModal').then((mod) => ({ default: mod.LikedTracksModal }))
);

const NAV_LINK =
  'text-ui ease-out-quart focus-visible:outline-accent hidden min-h-11 items-center rounded-sm transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-97 md:inline-flex';

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
  const openAuthModal = useAuthModalStore((s) => s.open);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const closeLibrary = () => setIsLibraryOpen(false);
  // Kept mounted after the first opening, so closing it can animate.
  const [hasOpenedLibrary, setHasOpenedLibrary] = useState(false);
  if (isLibraryOpen && !hasOpenedLibrary) setHasOpenedLibrary(true);

  return (
    <header className="px-page relative z-10 flex items-start justify-between gap-6 pt-5 md:pt-7">
      <h1 className="m-0 flex flex-col gap-1.5">
        <span className="text-mark condensed">aubesonore</span>
        <span className="sr-only"> — </span>
        <span className="text-sub text-text-muted font-normal text-balance">{m.hero_title()}</span>
      </h1>
      <nav aria-label={m.nav_label()} className="flex shrink-0 items-center gap-7">
        <a href="#plus-gardes" className={NAV_LINK}>
          {m.most_kept_title()}
        </a>
        <Link to={localizeHref('/musilogy')} className={NAV_LINK}>
          {m.musilogy_title()}
        </Link>
        {isLoading ? (
          <span aria-hidden="true" className="bg-surface-raised h-11 w-32 rounded-full" />
        ) : isAuthenticated && user ? (
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => setIsLibraryOpen(true)} className={OUTLINE_PILL}>
              {m.nav_my_tracks()}
            </button>
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
        ) : (
          <button type="button" onClick={() => openAuthModal()} className={OUTLINE_PILL}>
            {m.nav_sign_in()}
          </button>
        )}
      </nav>

      {hasOpenedLibrary ? (
        <ErrorBoundary
          FallbackComponent={(props) => <ModalErrorFallback {...props} onClose={closeLibrary} />}
        >
          <Suspense fallback={null}>
            <LikedTracksModal isOpen={isLibraryOpen} onClose={closeLibrary} />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </header>
  );
}
