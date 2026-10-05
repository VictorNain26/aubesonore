// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthInit } from '../components/AuthInit';
import { useAuthStore } from '../stores/authStore';
import AuthPage from './AuthPage';

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
    expect(screen.getByRole('link', { name: /aubesonore/ })).toHaveAttribute('href', '/');
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
  });

  it('names the track the listener wanted to keep', () => {
    open({ pathname: '/connexion', state: { keepTitle: 'Mimoun' } });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pour garder « Mimoun », connectez-vous.' })
    ).toBeInTheDocument();
  });

  it('switches to sign-up', async () => {
    open('/connexion');
    await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(await screen.findByLabelText('Nom')).toBeInTheDocument();
  });

  it('goes back to the page the listener came from once signed in', async () => {
    open({ pathname: '/connexion', state: { from: '/artist/a-1/mickey-3d' } });

    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('page artiste', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('opens on the new password from the reset link, and flags mismatched passwords', async () => {
    open({ pathname: '/reset-password', search: '?token=some-token' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Nouveau mot de passe' })
    ).toBeInTheDocument();
    const passwordInput = screen.getByLabelText('Mot de passe');
    expect(passwordInput).toHaveAccessibleDescription('6 caractères minimum.');
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
      http.post('http://localhost:3000/api/auth/forget-password', async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ status: true });
      })
    );
    open('/connexion');

    await userEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'jane@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vérifiez votre boîte mail' })
    ).toBeInTheDocument();
    expect(asked).toMatchObject({ email: 'jane@example.com' });
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Se connecter' })).toBeInTheDocument();
  });
});
