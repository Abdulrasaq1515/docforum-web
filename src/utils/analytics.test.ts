import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ALLOWED_EVENTS,
  trackEvent,
  trackPageview,
  scrubUrl,
  getAnalyticsConfig,
  _resetPageviewTracking,
} from './analytics';

// ───────────────────────────────────────────────────────────────────────────
// Privacy-preserving analytics tests. The most important guarantee these
// tests enforce: no id, no token, no PHI, no query string ever leaves the
// client via the analytics path. DNT / GPC disable it entirely.
// ───────────────────────────────────────────────────────────────────────────

describe('analytics — scrubUrl', () => {
  it('strips query strings entirely', () => {
    expect(scrubUrl('https://docforum.github.io/docforum-web/#/admin?intent=abc-123')).toBe('/admin');
    expect(scrubUrl('https://example.com/patient/health?section=allergies')).toBe('/patient/health');
  });

  it('replaces UUIDs in the path with :id', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(scrubUrl(`https://example.com/care-thread/${uuid}`)).toBe('/care-thread/:id');
  });

  it('replaces long prefixed ids with :id', () => {
    expect(scrubUrl('https://example.com/order/ord-9a7b3c1d2e4f')).toBe('/order/:id');
  });

  it('replaces numeric ids with :id', () => {
    expect(scrubUrl('https://example.com/patient/12345')).toBe('/patient/:id');
  });

  it('handles hash routing with query inside the hash', () => {
    expect(scrubUrl('https://example.com/#/admin/audit?entityType=PaymentIntent&cursor=abc')).toBe('/admin/audit');
  });

  it('returns / for the bare root', () => {
    expect(scrubUrl('https://example.com/')).toBe('/');
    expect(scrubUrl('https://example.com/#/')).toBe('/');
  });
});

describe('analytics — enable/disable', () => {
  let originalSendBeacon: typeof navigator.sendBeacon;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalSendBeacon = navigator.sendBeacon;
    originalFetch = globalThis.fetch;
    _resetPageviewTracking();
    vi.stubEnv('VITE_ANALYTICS_ENDPOINT', 'https://analytics.example.test');
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'docforum.example.test');
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'sendBeacon', { value: originalSendBeacon, configurable: true });
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is disabled when VITE_ANALYTICS_ENDPOINT is not set', () => {
    vi.stubEnv('VITE_ANALYTICS_ENDPOINT', '');
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    trackPageview('https://example.test/foo');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getAnalyticsConfig().enabled).toBe(false);
  });

  it('respects Do Not Track = 1', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    trackPageview('https://example.test/foo');
    expect(fetchSpy).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
  });

  it('respects Global Privacy Control', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    trackPageview('https://example.test/foo');
    expect(fetchSpy).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: false, configurable: true });
  });

  it('sends a pageview with a scrubbed URL when enabled', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: false, configurable: true });
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    trackPageview('https://example.test/patient/550e8400-e29b-41d4-a716-446655440000');
    expect(sendBeacon).toHaveBeenCalled();
    // sendBeacon was called with a Blob at the endpoint path.
    expect(sendBeacon.mock.calls[0][0]).toContain('/api/event');
  });

  it('does not send duplicate pageviews for the same scrubbed path', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: false, configurable: true });
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    trackPageview('https://example.test/admin');
    trackPageview('https://example.test/admin?intent=abc');
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});

describe('analytics — trackEvent allowlist', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ANALYTICS_ENDPOINT', 'https://analytics.example.test');
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends events on the allowlist', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    trackEvent('booking_completed', {});
    expect(sendBeacon).toHaveBeenCalled();
  });

  it('refuses events not on the allowlist (type-safe at compile time, runtime guard)', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    // Bypass the type system with a cast — this simulates a future caller
    // that smuggles in a non-allowlisted event name.
    trackEvent('specialty_searched' as never, {} as never);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('the allowlist contains no event whose properties would carry PHI', () => {
    // Sanity check: no allowlisted event name implies a search term,
    // specialty, or id field. We assert the explicit list here so adding
    // a new PHI-bearing event would require changing this test too.
    const PHI_WORDS = ['search', 'specialty', 'patient', 'doctor', 'id', 'name', 'email', 'diagnosis', 'symptom', 'medication'];
    for (const event of ALLOWED_EVENTS) {
      for (const word of PHI_WORDS) {
        expect(event).not.toMatch(new RegExp(word, 'i'));
      }
    }
  });
});

describe('analytics — config', () => {
  it('exposes the allowlist via getAnalyticsConfig for the privacy page', () => {
    const config = getAnalyticsConfig();
    expect(config.allowlist).toBe(ALLOWED_EVENTS);
    expect(Array.isArray(config.allowlist)).toBe(true);
    expect(config.allowlist.length).toBeGreaterThan(0);
  });
});
