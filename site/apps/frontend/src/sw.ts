/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import type { WorkboxPlugin } from 'workbox-core/types';

declare const self: ServiceWorkerGlobalScope;

// A new deploy takes over at once, as registerType 'autoUpdate' expects: without these, the new
// worker waited for every tab to close and listeners kept the old precached site
// (vite-plugin-pwa, "injectManifest": "you must include self.skipWaiting() and clientsClaim()").
void self.skipWaiting();
clientsClaim();

// The previous deploys' precaches are dropped once this one is in place.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Runtime cache for AzuraCast album artwork. Without this the same image is
// re-fetched on every visit / track repeat. CacheFirst is correct because the
// art URL is content-addressed (path includes the media id) so the content
// never changes for a given URL.
registerRoute(
  ({ url }) =>
    url.hostname === 'radio.aubesonore.fr' && /\/api\/station\/\d+\/art\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'aubesonore-artwork',
    // Cast through unknown: workbox plugin interfaces declare every hook as
    // non-optional even though plugins only implement a subset. The repo's
    // tsconfig has exactOptionalPropertyTypes which makes the structural
    // mismatch fatal. The cast is the canonical workaround used in Workbox docs.
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true,
      }),
    ] as unknown as WorkboxPlugin[],
  })
);
