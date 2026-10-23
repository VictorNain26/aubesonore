import { googleReturnText, reportGoogleOutcome } from './googleSignIn';

// The return page of the Google popup (auth/google.html): tells the sign-in page, then closes.
// The text stays only if the browser refuses to close the window.
reportGoogleOutcome(window.location.search);
const text = document.getElementById('message');
if (text) text.textContent = googleReturnText(window.location.search);
window.close();
