/// <reference types="chromecast-caf-sender" />

/**
 * Google Cast, the sender side (developers.google.com/cast/docs/web_sender/integrate): the SDK
 * script, then the framework's CastContext set on AubeSonore's receiver (cast/receiver.html),
 * registered in the Cast SDK Developer Console.
 */
export const RECEIVER_APP_ID = 'E913507F';

const SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

let loading: Promise<boolean> | null = null;

/**
 * Loads the sender SDK once, in a Chromium browser only: elsewhere it can cast nothing and the
 * page asks Google for nothing. Resolves whether casting is available.
 */
export function loadCastSdk(): Promise<boolean> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    if (!('chrome' in window)) {
      resolve(false);
      return;
    }
    // The SDK calls this global once loaded; it is set before the script, as the guide does.
    window.__onGCastApiAvailable = (isAvailable: boolean) => resolve(isAvailable);
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => resolve(false);
    document.head.append(script);
  });
  return loading;
}
