import { authApi } from '../lib/api';
import { baseLocale, isLocale } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';

/**
 * Google sign-in in a popup, so the page and its stream keep playing. The popup ends on the
 * return page (auth/google.html), which tells this page on a BroadcastChannel and closes itself.
 * A channel, not window.opener: the site's Cross-Origin-Opener-Policy (same-origin) cuts the
 * popup off from this page as soon as it reaches Google, while a channel joins every page of
 * one origin.
 */
const CHANNEL = 'aubesonore-google-sign-in';
const RETURN_PAGE = '/auth/google.html';

export type GoogleOutcome = 'signed-in' | 'failed';

let listening: BroadcastChannel | null = null;

/**
 * Starts the sign-in from the listener's click. The popup opens before anything is awaited:
 * a window opened later is no longer the click's, and browsers block it. A blocked popup, or a
 * browser without BroadcastChannel, gets the redirect instead, back to `backTo`; that one leaves
 * the page. `onOutcome` hears what the return page says; the latest attempt alone is heard. A
 * popup closed by the listener says nothing: once at Google, this page can no longer see it.
 */
export async function signInWithGoogle(
  backTo: string,
  locale: string,
  onOutcome: (outcome: GoogleOutcome) => void
): Promise<void> {
  const popup =
    typeof BroadcastChannel === 'undefined'
      ? null
      : window.open('', 'aubesonore-google', 'popup,width=480,height=640');
  if (!popup) {
    window.location.href = await authApi.googleSignInUrl({
      callbackURL: `${window.location.origin}${backTo}`,
    });
    return;
  }

  const returnPage = `${window.location.origin}${RETURN_PAGE}?lang=${locale}`;
  let url: string;
  try {
    url = await authApi.googleSignInUrl({ callbackURL: returnPage, errorCallbackURL: returnPage });
  } catch (err) {
    popup.close();
    throw err;
  }

  listening?.close();
  const channel = new BroadcastChannel(CHANNEL);
  listening = channel;
  channel.onmessage = (event: MessageEvent) => {
    channel.close();
    if (listening === channel) listening = null;
    onOutcome(event.data === 'signed-in' ? 'signed-in' : 'failed');
  };
  popup.location.href = url;
}

/** What the query Better Auth sent the return page to says: `?error=` when it failed. */
function outcomeOf(search: string): GoogleOutcome {
  return new URLSearchParams(search).has('error') ? 'failed' : 'signed-in';
}

/** The return page's word to the sign-in page. */
export function reportGoogleOutcome(search: string): void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(outcomeOf(search));
  channel.close();
}

/** What the return page shows if the browser keeps it open, in the sign-in page's language. */
export function googleReturnText(search: string): string {
  const lang = new URLSearchParams(search).get('lang');
  const locale = lang && isLocale(lang) ? lang : baseLocale;
  return outcomeOf(search) === 'signed-in'
    ? m.auth_google_return_done({}, { locale })
    : m.auth_google_return_failed({}, { locale });
}
