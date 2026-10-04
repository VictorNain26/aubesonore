import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { localizeHref } from '@/paraglide/runtime.js';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '../stores/localeStore';
import { AboutModal } from '../design/organisms/AboutModal';
import * as m from '@/paraglide/messages.js';

const LINK =
  'ease-out-quart focus-visible:outline-accent inline-flex min-h-11 items-center rounded-sm underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-4';

/** The browser's install prompt, kept until the listener asks for it. */
function useInstallPrompt(): (() => void) | null {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!prompt) return null;
  return () => {
    void prompt.prompt().then(() => setPrompt(null));
  };
}

export interface SiteFooterViewProps {
  locale: 'fr' | 'en';
  onLocaleChange: (locale: 'fr' | 'en') => void;
  onOpenAbout: () => void;
  onInstall: (() => void) | null;
}

export function SiteFooterView({
  locale,
  onLocaleChange,
  onOpenAbout,
  onInstall,
}: SiteFooterViewProps) {
  return (
    <footer className="border-border text-ui mx-page flex flex-wrap items-center justify-between gap-6 border-t pt-7 pb-32 font-normal">
      <span className="text-text-muted">
        © {new Date().getFullYear()} AubeSonore · {m.footer_free()}
      </span>
      <div className="flex flex-wrap items-center gap-x-7">
        <Link to={localizeHref('/musilogy')} className={LINK}>
          {m.musilogy_title()}
        </Link>
        <button type="button" onClick={onOpenAbout} className={LINK}>
          {m.footer_about()}
        </button>
        <a href={m.legal_href()} target="_blank" rel="noopener noreferrer" className={LINK}>
          {m.footer_legal()}
        </a>
        {onInstall ? (
          <button type="button" onClick={onInstall} className={LINK}>
            {m.footer_install()}
          </button>
        ) : null}
        <span
          role="group"
          aria-label={m.footer_language()}
          className="text-caption flex items-center gap-1 font-mono"
        >
          {(['fr', 'en'] as const).map((code, i) => (
            <span key={code} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden="true">/</span> : null}
              <button
                type="button"
                lang={code}
                onClick={() => onLocaleChange(code)}
                aria-pressed={locale === code}
                className={cn(
                  'ease-out-quart focus-visible:outline-accent min-h-11 min-w-8 rounded-sm uppercase focus-visible:outline-2',
                  locale === code
                    ? 'font-bold'
                    : 'underline decoration-1 underline-offset-4 hover:decoration-2'
                )}
              >
                {code}
              </button>
            </span>
          ))}
        </span>
      </div>
    </footer>
  );
}

export function SiteFooter() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const onInstall = useInstallPrompt();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [hasOpenedAbout, setHasOpenedAbout] = useState(false);
  if (isAboutOpen && !hasOpenedAbout) setHasOpenedAbout(true);

  return (
    <>
      <SiteFooterView
        locale={locale}
        onLocaleChange={setLocale}
        onOpenAbout={() => setIsAboutOpen(true)}
        onInstall={onInstall}
      />
      {hasOpenedAbout ? (
        <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      ) : null}
    </>
  );
}
