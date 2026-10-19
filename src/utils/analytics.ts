// ───────────────────────────────────────────────────────────────────────────
// Privacy-preserving product analytics.
//
// The team needs to know where patients drop out of booking and which
// screens confuse doctors — but third-party trackers in a health app leak
// sensitive data (which specialist someone searched for is PHI). This
// module enforces a strict privacy contract:
//
//   1. Cookieless, aggregate, self-hostable (Plausible / Umami compatible).
//      No third-party tracker; data goes only to a self-hosted endpoint.
//   2. Explicit event allowlist. Only the events in `ALLOWED_EVENTS` can be
//      tracked, and none of them accept PHI-bearing properties.
//   3. No ids or tokens in tracked URLs. The path is the only URL portion
//      sent; query strings and hash routes are scrubbed of ids/tokens
//      before any pageview is recorded.
//   4. Respects Do Not Track (DNT) and Global Privacy Control (GPC).
//   5. Disabled by default. Only enabled when VITE_ANALYTICS_ENDPOINT is
//      set to a self-hosted origin (no default).
//   6. CSP must allow only the configured analytics origin. (Documented
//      in ARCHITECTURE_ESSENTIALS.md — enforcement is at deploy time.)
//
// No PHI is ever collected. No specialties, search terms, free-text fields,
// user ids, patient ids, or order ids are recorded. All funnel events are
// bare counters (`booking_started`), not contextual payloads.
// ───────────────────────────────────────────────────────────────────────────

/** The full allowlist of events this app may track. Adding a new event
 * means changing this list, the type, and the privacy page — that's
 * deliberate: an allowlist is only as strong as the friction to grow it. */
export const ALLOWED_EVENTS = [
  // Booking funnel (patient)
  'booking_started',
  'booking_completed',
  'booking_abandoned',
  // Referral funnel (patient + doctor)
  'referral_started',
  'referral_accepted',
  'referral_declined',
  // Order funnel (patient + facility)
  'order_placed',
  'order_fulfilled',
  // Onboarding (any role)
  'signup_completed',
  'login_completed',
  'wallet_linked',
  // Data rights (patient)
  'data_export_requested',
  'account_deleted',
  // Care thread (patient + doctor)
  'care_thread_viewed',
  // Facility verification (facility)
  'order_verified',
  // Admin actions (admin)
  'admin_referral_reassigned',
  'admin_referral_cancelled',
  // Privacy page viewed
  'privacy_page_viewed',
] as const;

export type AnalyticsEvent = (typeof ALLOWED_EVENTS)[number];

/** Properties for each event. Every event's properties are an explicit,
 * closed shape — no `Record<string, unknown>` is ever accepted. PHI
 * (specialty, search term, patient id, doctor id, order id) is forbidden. */
export interface AnalyticsEventProperties {
  // Common
  'signup_completed': { role: 'patient' | 'doctor' };
  'login_completed': { role: 'patient' | 'doctor' | 'facility' | 'admin' };
  'privacy_page_viewed': Record<string, never>;

  // Booking — only step + result, never specialty or doctor
  'booking_started': Record<string, never>;
  'booking_completed': Record<string, never>;
  'booking_abandoned': { step: 'specialty_select' | 'slot_select' | 'intake_form' | 'review' };

  // Referral
  'referral_started': Record<string, never>;
  'referral_accepted': Record<string, never>;
  'referral_declined': Record<string, never>;

  // Order
  'order_placed': { orderType: 'prescription' | 'lab_order' };
  'order_fulfilled': { orderType: 'prescription' | 'lab_order' };
  'order_verified': { result: 'valid' | 'superseded' | 'expired' | 'fulfilled' | 'not_eligible' };

  // Wallet + data rights
  'wallet_linked': Record<string, never>;
  'data_export_requested': Record<string, never>;
  'account_deleted': Record<string, never>;

  // Care thread
  'care_thread_viewed': Record<string, never>;

  // Admin — no referral id, no doctor id, no patient id
  'admin_referral_reassigned': Record<string, never>;
  'admin_referral_cancelled': Record<string, never>;
}

// Read env vars lazily (inside functions) so tests can use vi.stubEnv to
// control them per-test. Module-level constants would be captured at import
// time and wouldn't reflect per-test stubs.
function getEndpoint(): string | undefined {
  const v = import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined;
  return v || undefined;
}
function getDomain(): string | undefined {
  const v = import.meta.env.VITE_ANALYTICS_DOMAIN as string | undefined;
  return v || undefined;
}

/** True only when a self-hosted endpoint is configured AND the user has
 *  not opted out via DNT or GPC. */
function isAnalyticsEnabled(): boolean {
  if (!getEndpoint()) return false;
  const nav = navigator as Navigator & {
    doNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const dnt = nav.doNotTrack;
  const gpc = nav.globalPrivacyControl;
  if (gpc === true) return false;
  if (dnt === '1' || dnt === 'yes') return false;
  return true;
}

/** Strip ids and tokens from a URL before recording it. Only the path is
 *  kept; query strings are dropped entirely (they may carry `intent=…`,
 *  `cursor=…`, `tab=…`, filter values, etc.). Hash routes are parsed and
 *  their query is stripped too. UUIDs and numeric ids in the path are
 *  replaced with `:id` so two different patients don't generate two
 *  different page paths. */
export function scrubUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.origin);
  } catch {
    return '(invalid)';
  }

  // For hash routing, the route lives in the hash.
  let path = url.pathname;
  if (url.hash) {
    // hash like #/admin?intent=abc → /admin
    const hashPath = url.hash.replace(/^#/, '');
    if (hashPath.startsWith('/')) {
      const hashUrl = new URL(hashPath, window.location.origin);
      path = hashUrl.pathname;
    } else {
      path = '/';
    }
  }

  // Drop the query string entirely.
  // Replace UUIDs and long numeric ids with :id so we never record them.
  const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const LONG_ID_PATTERN = /\/[a-z]+-[a-z0-9]{8,}/gi;
  const NUMERIC_ID_PATTERN = /\/\d{3,}/g;
  const cleaned = path
    .replace(UUID_PATTERN, ':id')
    .replace(LONG_ID_PATTERN, '/:id')
    .replace(NUMERIC_ID_PATTERN, '/:id');

  return cleaned || '/';
}

let currentPageviewSent = '';

/** Reset the dedup guard — for use in tests only. */
export function _resetPageviewTracking(): void {
  currentPageviewSent = '';
}

function sendBeacon(path: string, payload: unknown): void {
  const endpoint = getEndpoint();
  if (!endpoint) return;
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(`${endpoint}${path}`, blob);
      if (ok) return;
    }
    void fetch(`${endpoint}${path}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      mode: 'cors',
      keepalive: true,
    }).catch(() => { /* analytics is best-effort; never throw */ });
  } catch { /* analytics is best-effort; never throw */ }
}

/** Record a pageview. Called from the router on location change. */
export function trackPageview(rawUrl: string, referrer: string = ''): void {
  if (!isAnalyticsEnabled()) return;
  const path = scrubUrl(rawUrl);
  // Avoid duplicate pageviews for the same scrubbed path.
  if (path === currentPageviewSent) return;
  currentPageviewSent = path;
  sendBeacon('/api/event', {
    type: 'pageview',
    url: path,
    referrer: referrer ? scrubUrl(referrer) : '',
    domain: getDomain() ?? window.location.hostname,
    timestamp: new Date().toISOString(),
  });
}

/** Record an allowed funnel event. The event MUST be in the allowlist; the
 *  properties MUST match the closed shape declared for it. */
export function trackEvent<E extends AnalyticsEvent>(
  name: E,
  props: AnalyticsEventProperties[E],
): void {
  if (!isAnalyticsEnabled()) return;
  // Belt-and-braces: if a caller smuggles in an unknown event, bail.
  if (!ALLOWED_EVENTS.includes(name)) return;
  sendBeacon('/api/event', {
    type: 'event',
    name,
    props,
    url: scrubUrl(window.location.href),
    domain: getDomain() ?? window.location.hostname,
    timestamp: new Date().toISOString(),
  });
}

/** Exposed for tests + the privacy page to render the live config. */
export function getAnalyticsConfig(): {
  enabled: boolean;
  endpoint: string | undefined;
  domain: string | undefined;
  allowlist: readonly AnalyticsEvent[];
} {
  return {
    enabled: isAnalyticsEnabled(),
    endpoint: getEndpoint(),
    domain: getDomain(),
    allowlist: ALLOWED_EVENTS,
  };
}
