// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthInit } from '../shell/AuthInit';
import { useAuthStore } from '../stores/authStore';
import { keepRequest, savePendingKeep } from '../lib/pendingKeep';
import { AuthPage } from './AuthPage';
import { toast } from 'sonner';
import { reportGoogleOutcome } from '../auth/googleSignIn';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function open(entry: string | { pathname: string; search?: string; state?: unknown }) {
  useAuthStore.setState({ user: null, isLoading: true, isAuthenticated: false, authError: null });
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthInit />
      <Routes>
        <Route path="/connexion" element={<AuthPage />} />
        <Route path="/reset-password" element={<AuthPage />} />
        <Route path="/" element={<p>accueil</p>} />
        <Route path="/artist/:id/:slug" element={<p>page artiste</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthPage', () => {
  it('is a page of the site, under its header, with the sign-in form', () => {
    open('/connexion');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^AubeSonore/ })).toHaveAttribute('href', '/');
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
  });

  it('names the track the listener wanted to keep', () => {
    open({ pathname: '/connexion', state: { keepTitle: 'Mimoun' } });
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Pour garder «\u00a0Mimoun\u00a0», connectez-vous.',
      })
    ).toBeInTheDocument();
  });

  it('says what an account brings under the title, unless the title already says why', () => {
    const promise = () =>
      screen.getByRole('heading', { level: 1 }).parentElement?.textContent ?? '';
    const { unmount } = open('/connexion');
    expect(promise()).toContain('Gardez ce qui vous arrête.');
    unmount();
    open({ pathname: '/connexion', state: { keepTitle: 'Mimoun' } });
    expect(promise()).not.toContain('Gardez ce qui vous arrête.');
  });

  it('switches to sign-up', async () => {
    open('/connexion');
    await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(await screen.findByLabelText('Nom')).toBeInTheDocument();
  });

  it.each([
    { form: 'sign-up', entry: { pathname: '/connexion' }, signUp: true },
    {
      form: 'a new password',
      entry: { pathname: '/reset-password', search: '?token=some-token' },
      signUp: false,
    },
  ])('asks for 8 characters on $form, the server minimum', async ({ entry, signUp }) => {
    open(entry);
    if (signUp) await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    const passwordInput = await screen.findByLabelText('Mot de passe');
    expect(passwordInput).toHaveAttribute('minlength', '8');
    const tooShort = 'Le mot de passe doit contenir au moins 8 caractères.';

    await userEvent.type(passwordInput, 'abc1234');
    await userEvent.tab();
    expect(screen.getByText(tooShort)).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(passwordInput, '5');
    expect(screen.queryByText(tooShort)).not.toBeInTheDocument();
  });

  it("keeps the typed address on a switch, the focus on the new form's title", async () => {
    open('/connexion');

    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'jane@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié\u00a0?' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Mot de passe oublié' })).toHaveFocus();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('jane@example.com');
  });

  it('keeps the track to keep while the page is shown, forgets it once left unsigned', async () => {
    savePendingKeep(keepRequest('Mimoun', 'Rachid Taha'));
    useAuthStore.setState({ user: null, isLoading: false, isAuthenticated: false });
    // StrictMode mounts, unmounts and mounts again, as React may do with any page it keeps.
    const { unmount } = render(
      <StrictMode>
        <MemoryRouter initialEntries={['/connexion']}>
          <AuthPage />
        </MemoryRouter>
      </StrictMode>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sessionStorage.getItem('aubesonore-pending-keep')).not.toBeNull();

    unmount();
    await waitFor(() => expect(sessionStorage.getItem('aubesonore-pending-keep')).toBeNull());
  });

  it('goes back to the page the listener came from once signed in', async () => {
    open({ pathname: '/connexion', state: { from: '/artist/a-1/mickey-3d' } });

    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('page artiste', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('after sign-up, asks to open the verification email and leaves the listener signed out', async () => {
    open('/connexion');

    await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    await userEvent.type(await screen.findByLabelText('Nom'), 'Jane');
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vérifiez votre boîte mail' })
    ).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.queryByText('accueil')).not.toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it('signs in with Google in a popup and goes back to where the listener was, without leaving', async () => {
    let signedIn = false;
    server.use(
      http.post('http://localhost:3000/api/auth/sign-in/social', () =>
        HttpResponse.json({ url: 'https://accounts.google.com/o/oauth2/auth?client_id=x' })
      ),
      http.get('http://localhost:3000/api/auth/get-session', () =>
        signedIn
          ? HttpResponse.json({ user: { id: 'u1', email: 'a@b.c', name: 'A' } })
          : HttpResponse.json(null)
      )
    );
    const popup = { location: { href: 'about:blank' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    try {
      open({ pathname: '/connexion', state: { from: '/artist/a-1/mickey-3d' } });

      await userEvent.click(screen.getByRole('button', { name: 'Continuer avec Google' }));
      await vi.waitFor(() => expect(popup.location.href).toContain('accounts.google.com'));

      // The return page, in the popup, once Google sent the listener back signed in.
      signedIn = true;
      reportGoogleOutcome('?lang=fr');

      expect(await screen.findByText('page artiste', {}, { timeout: 3000 })).toBeInTheDocument();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('opens on the new password from the reset link, and flags mismatched passwords', async () => {
    open({ pathname: '/reset-password', search: '?token=some-token' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Nouveau mot de passe' })
    ).toBeInTheDocument();
    const passwordInput = screen.getByLabelText('Mot de passe');
    expect(passwordInput).toHaveAccessibleDescription('8 caractères minimum.');
    const confirmInput = screen.getByLabelText('Confirmer le mot de passe');

    await userEvent.type(passwordInput, 'password123');
    await userEvent.type(confirmInput, 'different123');
    await userEvent.tab();

    expect(screen.getByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument();
    expect(confirmInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('says where the reset link went, and leads back to sign-in', async () => {
    let asked: unknown = null;
    server.use(
      http.post('http://localhost:3000/api/auth/request-password-reset', async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ status: true });
      })
    );
    open('/connexion');

    await userEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié\u00a0?' }));
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'jane@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vérifiez votre boîte mail' })
    ).toBeInTheDocument();
    expect(asked).toEqual({
      email: 'jane@example.com',
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // One sentence: the address, a comma, then what waits in the inbox.
    const sentence =
      'Si un compte existe pour jane@example.com, un e-mail vous attend avec un lien pour choisir un nouveau mot de passe.';
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === sentence)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Se connecter' })).toBeInTheDocument();
  });

  it('keeps the form and says so when the reset request fails, even with a 404', async () => {
    server.use(
      http.post(
        'http://localhost:3000/api/auth/request-password-reset',
        () => new HttpResponse(null, { status: 404 })
      )
    );
    open('/connexion');

    await userEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié\u00a0?' }));
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'jane@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'La demande n’a pas abouti. Réessayez dans un instant.',
        expect.anything()
      )
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mot de passe oublié' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Vérifiez votre boîte mail' })
    ).not.toBeInTheDocument();
  });
});
