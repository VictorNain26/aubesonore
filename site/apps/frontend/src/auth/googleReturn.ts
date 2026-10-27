import { googleReturnPage, reportGoogleOutcome } from './googleSignIn';

// The return page of the Google popup (auth/google.html): tells the sign-in page, then closes.
// The text stays only if the browser refuses to close the window.
reportGoogleOutcome(window.location.search);
const { lang, text } = googleReturnPage(window.location.search);
document.documentElement.lang = lang;
const message = document.getElementById('message');
if (message) message.textContent = text;
window.close();
