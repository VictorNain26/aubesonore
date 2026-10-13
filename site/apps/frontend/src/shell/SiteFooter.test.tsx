// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render as renderInDom, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { SiteFooter, SiteFooterView } from './SiteFooter';

// The footer links to Musilogy through the router, so the stream keeps playing.
const render = (ui: ReactElement) => renderInDom(ui, { wrapper: MemoryRouter });
const HREFS = { fr: '/mentions-legales/', en: '/en/legal/' };

describe('SiteFooterView', () => {
  it('links each language to this page in it, marks the current one, and switches in place', async () => {
    const onLocaleChange = vi.fn();
    render(
      <SiteFooterView
        locale="fr"
        languageHrefs={HREFS}
        onLocaleChange={onLocaleChange}
        onInstall={null}
      />
    );

    expect(screen.getByRole('link', { name: 'fr' })).toHaveAttribute('aria-current', 'true');
    const english = screen.getByRole('link', { name: 'en' });
    expect(english).toHaveAttribute('href', '/en/legal/');
    expect(english).toHaveAttribute('hreflang', 'en');
    await userEvent.click(english);
    expect(onLocaleChange).toHaveBeenCalledWith('en');
  });

  it('gives each language the address of the page the listener is on', () => {
    renderInDom(
      <MemoryRouter initialEntries={['/mentions-legales/']}>
        <SiteFooter />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'en' })).toHaveAttribute('href', '/en/legal/');
    expect(screen.getByRole('link', { name: 'fr' })).toHaveAttribute('href', '/mentions-legales/');
  });

  it('offers installation only when the browser allows it', async () => {
    const onInstall = vi.fn();
    const { rerender } = render(
      <SiteFooterView locale="fr" languageHrefs={HREFS} onLocaleChange={vi.fn()} onInstall={null} />
    );
    expect(
      screen.queryByRole('button', { name: "Ajouter à l'écran d'accueil" })
    ).not.toBeInTheDocument();

    rerender(
      <SiteFooterView
        locale="fr"
        languageHrefs={HREFS}
        onLocaleChange={vi.fn()}
        onInstall={onInstall}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: "Ajouter à l'écran d'accueil" }));
    expect(onInstall).toHaveBeenCalledOnce();
  });
});
