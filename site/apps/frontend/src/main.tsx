import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist-mono';
import './index.css';
import { handlePreloadError } from './lib/preloadReload';
import { readLocaleChoice } from './stores/localeStore';
import { readArtistPageData, seedArtistPage } from './lib/artistPageData';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

// The site puts the reader back itself (lib/scrollManager.tsx): the browser's own restoration
// would land on a page still too short, its content coming after the route.
history.scrollRestoration = 'manual';

window.addEventListener('vite:preloadError', () => {
  handlePreloadError(sessionStorage, () => window.location.reload(), Date.now());
});

// The production home arrives pre-rendered (scripts/prerender.mjs), an artist page rendered by the
// backend with its data: hydrate them from it. The dev server serves an empty root.
const artistPage = readArtistPageData(document);
if (artistPage) seedArtistPage(artistPage);
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
if (window.location.pathname === '/' && readLocaleChoice() === 'en') {
  window.location.replace(`/en/${window.location.search}${window.location.hash}`);
} else if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}

if (import.meta.env.DEV) {
  void import('web-vitals').then(({ onLCP, onCLS, onINP }) => {
    onLCP((m) => console.debug('[CWV] LCP', m));
    onCLS((m) => console.debug('[CWV] CLS', m));
    onINP((m) => console.debug('[CWV] INP', m));
  });
}
