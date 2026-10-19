import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Router is configurable at build time (issue #119 — ADR 0001):
//   VITE_USE_HASH_ROUTER=true  → HashRouter  (required for GitHub Pages, which
//                                              has no server-side rewrite rule)
//   (default)                  → BrowserRouter (any host with rewrite support)
//
// The HashRedirectShim mounted in BrowserRouter mode converts old #/path
// links (bookmarks, previously-sent emails) to clean paths transparently.
// See docs/adr/0001-routing-strategy.md for the full decision record.
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './query-client';
import { useAuthStore } from './store/auth-store';
import App from './App';
import './styles/global.css';

const USE_HASH_ROUTER = import.meta.env.VITE_USE_HASH_ROUTER === 'true';
const Router = USE_HASH_ROUTER ? HashRouter : BrowserRouter;

// Mock API for local development (issue #95) — only runs under
// `npm run dev:mock` (a DEV build with VITE_ENABLE_MOCKS=true). In
// production builds import.meta.env.DEV is statically false, so this
// branch is dead code and the mocks chunk is never emitted — CI enforces
// that with `npm run check:dist` (scripts/check-dist-no-mocks.mjs).
// Awaited before the first render so the persona session exists when
// route guards first evaluate (deep links would otherwise bounce to the
// login screen mid-boot).
if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true') {
  const { startMockApi } = await import('./mocks/setup');
  startMockApi();
}

// Enable preview session when previewRole query param is set (useful for screenshots & review)
const urlParams = new URLSearchParams(window.location.search);
const previewRole = urlParams.get('previewRole');
if (previewRole && (previewRole === 'doctor' || previewRole === 'facility' || previewRole === 'patient' || previewRole === 'admin')) {
  useAuthStore.getState().setSession(
    {
      id: `preview-${previewRole}-user`,
      email: `${previewRole}@docforum.org`,
      role: previewRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'preview-token',
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
