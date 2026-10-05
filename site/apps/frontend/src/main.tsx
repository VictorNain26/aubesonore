import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist-mono';
import './index.css';
import { handlePreloadError } from './lib/preloadReload';
import { readLocaleChoice } from './stores/localeStore';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

// A reload starts at the top: the browser would put the reader back mid-page, under a hero that
// renders after it. Back and forward keep restoring their place.
const navigation = performance.getEntriesByType('navigation')[0];
if (navigation instanceof PerformanceNavigationTiming && navigation.type === 'reload') {
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  window.addEventListener(
    'load',
    () => {
      setTimeout(() => {
        history.scrollRestoration = 'auto';
      });
    },
    { once: true }
  );
}

window.addEventListener('vite:preloadError', () => {
  handlePreloadError(sessionStorage, () => window.location.reload(), Date.now());
});

// The production home arrives pre-rendered (scripts/prerender.mjs): hydrate it.
// Artist pages (app.html) and the dev server serve an empty root.
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
