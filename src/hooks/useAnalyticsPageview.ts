import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageview } from '../utils/analytics';

/**
 * Tracks a pageview whenever the react-router location changes.
 *
 * Should be mounted once near the app root (inside a Router, outside the
 * Routes) so it catches every route transition. All URL scrubbing is
 * delegated to `analytics.scrubUrl` — no ids or query strings are ever
 * forwarded.
 *
 * Usage:
 *   function App() {
 *     useAnalyticsPageview();
 *     return <Routes>...</Routes>;
 *   }
 */
export function useAnalyticsPageview(): void {
  const location = useLocation();
  // Track the referrer only once across the app session — subsequent
  // transitions use the previous scrubbed path as the referrer.
  const prevPathRef = useRef<string>('');

  useEffect(() => {
    const href = window.location.href;
    const referrer = prevPathRef.current;
    trackPageview(href, referrer);
    prevPathRef.current = href;
  }, [location.key]);
}
