/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// A new deploy takes over at once, as registerType 'autoUpdate' expects: without these, the new
// worker waited for every tab to close and listeners kept the old precached site
// (vite-plugin-pwa, "injectManifest": "you must include self.skipWaiting() and clientsClaim()").
void self.skipWaiting();
clientsClaim();

// The previous deploys' precaches are dropped once this one is in place.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// No runtime cache for the covers: AzuraCast serves them with max-age=31536000, which the
// browser's HTTP cache keeps.
