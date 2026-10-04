// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render as renderInDom, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { SiteFooterView } from './SiteFooter';

// The footer links to Musilogy through the router, so the stream keeps playing.
const render = (ui: ReactElement) => renderInDom(ui, { wrapper: MemoryRouter });

describe('SiteFooterView', () => {
  it('switches language and marks the current one', async () => {
    const onLocaleChange = vi.fn();
    render(
      <SiteFooterView
        locale="fr"
        onLocaleChange={onLocaleChange}
        onOpenAbout={vi.fn()}
        onInstall={null}
      />
    );

    expect(screen.getByRole('button', { name: 'fr' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(onLocaleChange).toHaveBeenCalledWith('en');
  });

  it('offers installation only when the browser allows it', async () => {
    const onInstall = vi.fn();
    const { rerender } = render(
      <SiteFooterView locale="fr" onLocaleChange={vi.fn()} onOpenAbout={vi.fn()} onInstall={null} />
    );
    expect(
      screen.queryByRole('button', { name: "Ajouter à l'écran d'accueil" })
    ).not.toBeInTheDocument();

    rerender(
      <SiteFooterView
        locale="fr"
        onLocaleChange={vi.fn()}
        onOpenAbout={vi.fn()}
        onInstall={onInstall}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: "Ajouter à l'écran d'accueil" }));
    expect(onInstall).toHaveBeenCalledOnce();
  });
});
