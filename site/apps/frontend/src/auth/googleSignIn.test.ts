import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import {
  googleReturnText,
  reportGoogleOutcome,
  signInWithGoogle,
  type GoogleOutcome,
} from './googleSignIn';

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/auth?client_id=x';

/** Better Auth's answer to /sign-in/social, and the body it was sent. */
function answerSocial(answer: () => Response = () => HttpResponse.json({ url: AUTHORIZE })) {
  const asked: unknown[] = [];
  server.use(
    http.post('http://localhost:3000/api/auth/sign-in/social', async ({ request }) => {
      asked.push(await request.json());
      return answer();
    })
  );
  return asked;
}

/** What the page's window does: where it went, and the popup it opened (null when blocked). */
function stubWindow(popup: { location: { href: string }; close: () => void } | null) {
  const location = { origin: 'http://localhost:5173', href: 'http://localhost:5173/connexion' };
  const open = vi.fn(() => popup);
  vi.stubGlobal('window', { location, open });
  return { location, open };
}

describe('signInWithGoogle', () => {
  let popup: { location: { href: string }; close: ReturnType<typeof vi.fn<() => void>> };

  beforeEach(() => {
    popup = { location: { href: 'about:blank' }, close: vi.fn<() => void>() };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs in in a popup that comes back to the return page, and the page never leaves', async () => {
    const asked = answerSocial();
    const { location, open } = stubWindow(popup);

    await signInWithGoogle('/artist/a-1/x', 'en', () => {});

    expect(open).toHaveBeenCalledOnce();
    expect(popup.location.href).toBe(AUTHORIZE);
    expect(location.href).toBe('http://localhost:5173/connexion');
    expect(asked).toEqual([
      {
        provider: 'google',
        callbackURL: 'http://localhost:5173/auth/google.html?lang=en',
        errorCallbackURL: 'http://localhost:5173/auth/google.html?lang=en',
      },
    ]);
  });

  it('opens the popup before waiting for the server, or the browser blocks it', async () => {
    let openedBeforeAnswer = false;
    const { open } = stubWindow(popup);
    answerSocial(() => {
      openedBeforeAnswer = open.mock.calls.length === 1;
      return HttpResponse.json({ url: AUTHORIZE });
    });

    await signInWithGoogle('/', 'fr', () => {});

    expect(openedBeforeAnswer).toBe(true);
  });

  it('hears from the return page that the listener is signed in', async () => {
    answerSocial();
    stubWindow(popup);
    const heard: GoogleOutcome[] = [];
    const arrived = new Promise<void>((resolve) => {
      void signInWithGoogle('/', 'fr', (outcome) => {
        heard.push(outcome);
        resolve();
      }).then(() => reportGoogleOutcome(''));
    });

    await arrived;
    expect(heard).toEqual(['signed-in']);
  });

  it('hears that Google refused, from the error Better Auth hands the return page', async () => {
    answerSocial();
    stubWindow(popup);
    const heard: GoogleOutcome[] = [];
    const arrived = new Promise<void>((resolve) => {
      void signInWithGoogle('/', 'fr', (outcome) => {
        heard.push(outcome);
        resolve();
      }).then(() => reportGoogleOutcome('?lang=fr&error=access_denied'));
    });

    await arrived;
    expect(heard).toEqual(['failed']);
  });

  it('listens for the latest attempt only, so a second click is not answered twice', async () => {
    answerSocial();
    stubWindow(popup);
    const heard: GoogleOutcome[] = [];
    await signInWithGoogle('/', 'fr', (outcome) => heard.push(outcome));
    const arrived = new Promise<void>((resolve) => {
      void signInWithGoogle('/', 'fr', (outcome) => {
        heard.push(outcome);
        resolve();
      }).then(() => reportGoogleOutcome(''));
    });

    await arrived;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard).toEqual(['signed-in']);
  });

  it('closes the popup and throws when the server gives no address', async () => {
    answerSocial(() => HttpResponse.json({}));
    stubWindow(popup);

    await expect(signInWithGoogle('/', 'fr', () => {})).rejects.toThrow(
      'La connexion avec Google n’a pas pu démarrer. Réessayez.'
    );
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('falls back to the redirect, back to the page the listener came from, when the popup is blocked', async () => {
    const asked = answerSocial();
    const { location } = stubWindow(null);

    await signInWithGoogle('/artist/a-1/x', 'fr', () => {});

    expect(location.href).toBe(AUTHORIZE);
    expect(asked).toEqual([
      { provider: 'google', callbackURL: 'http://localhost:5173/artist/a-1/x' },
    ]);
  });

  it('falls back to the redirect, without opening a popup, where BroadcastChannel is missing', async () => {
    answerSocial();
    const { location, open } = stubWindow(popup);
    vi.stubGlobal('BroadcastChannel', undefined);

    await signInWithGoogle('/', 'fr', () => {});

    expect(open).not.toHaveBeenCalled();
    expect(location.href).toBe(AUTHORIZE);
  });
});

describe('googleReturnText', () => {
  it("says, in the listener's language, that they are signed in and the window can close", () => {
    expect(googleReturnText('?lang=en')).toBe('You’re signed in. You can close this window.');
    expect(googleReturnText('?lang=fr')).toBe(
      'Vous êtes connecté. Vous pouvez fermer cette fenêtre.'
    );
  });

  it('says the sign-in did not go through when Better Auth reports an error', () => {
    expect(googleReturnText('?lang=fr&error=access_denied')).toBe(
      'La connexion n’a pas abouti. Vous pouvez fermer cette fenêtre.'
    );
    expect(googleReturnText('?lang=en&error=access_denied')).toBe(
      'Signing in didn’t go through. You can close this window.'
    );
  });

  it('speaks French when the language is missing or unknown', () => {
    expect(googleReturnText('')).toBe('Vous êtes connecté. Vous pouvez fermer cette fenêtre.');
    expect(googleReturnText('?lang=de')).toBe(
      'Vous êtes connecté. Vous pouvez fermer cette fenêtre.'
    );
  });
});
