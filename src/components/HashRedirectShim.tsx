import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * HashRedirectShim — mounts in BrowserRouter mode to catch old `#/path`
 * links and redirect them to clean history-API paths.
 *
 * The scenario: a user follows an emailed link or bookmark that was
 * generated when this app ran under HashRouter — e.g.
 *   `https://docforum.example.com/#/claim-account?token=xyz`
 *
 * Under BrowserRouter the browser sends `GET /` and the React app loads,
 * but `window.location.hash` is `#/claim-account?token=xyz`. Without the
 * shim the router sees only `/` (the root) and the user's token is lost.
 *
 * The shim detects this on mount:
 *   1. pathname === '/' (the root — Pages/server didn't match anything else)
 *   2. hash starts with `#/` (a hash route, not an anchor)
 *
 * It then replaces the current history entry with the clean path, so the
 * URL bar shows `/claim-account?token=xyz` and `<Routes>` matches normally.
 *
 * Usage: mount once inside BrowserRouter, outside <Routes>:
 *
 *   function App() {
 *     return (
 *       <>
 *         <HashRedirectShim />
 *         <Routes>…</Routes>
 *       </>
 *     );
 *   }
 *
 * In HashRouter mode this component is not mounted (see main.tsx).
 */
export function HashRedirectShim() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const { pathname, hash, search } = location;
    // Only act when we're at the root AND the hash looks like a hash route.
    if (pathname !== '/') return;
    if (!hash.startsWith('#/')) return;

    // Extract the hash-encoded path and its own query string.
    // e.g. `#/claim-account?token=xyz` → path=`/claim-account`, search=`?token=xyz`
    const hashContent = hash.slice(1); // strip leading `#`
    const qIdx = hashContent.indexOf('?');
    const hashPath = qIdx >= 0 ? hashContent.slice(0, qIdx) : hashContent;
    const hashSearch = qIdx >= 0 ? hashContent.slice(qIdx) : '';

    // Merge any search params from the outer URL too (rare but possible).
    const mergedSearch = search && hashSearch
      ? `${hashSearch}&${search.slice(1)}`  // drop the leading `?` from `search`
      : hashSearch || search;

    const destination = `${hashPath}${mergedSearch}`;

    // replace so the "back" button doesn't return to the malformed URL.
    navigate(destination, { replace: true });
  }, [location, navigate]);

  return null;
}
