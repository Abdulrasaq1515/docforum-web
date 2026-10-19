import { Fragment, useEffect } from 'react';
import { ALLOWED_EVENTS, getAnalyticsConfig, trackEvent } from '../utils/analytics';

// ───────────────────────────────────────────────────────────────────────────
// Privacy page — documents what the app collects (and doesn't) so a user
// can make an informed choice. Required by issue #118.
// ───────────────────────────────────────────────────────────────────────────

export function PrivacyPage() {
  const config = getAnalyticsConfig();

  // Record a single pageview-style event so the team can see how often this
  // page is viewed (and no more — there's nothing PHI-bearing about viewing
  // the privacy notice).
  useEffect(() => {
    trackEvent('privacy_page_viewed', {});
  }, []);

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '44rem' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', margin: '0 0 var(--space-2)' }}>
          Privacy & data use
        </h1>
        <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: 'var(--text-base)' }}>
          DocForum is a healthcare platform. Your privacy is the design constraint, not an afterthought.
        </p>
      </div>

      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', margin: '0 0 var(--space-3)' }}>
          Product analytics
        </h2>
        <p>
          To understand where patients drop out of booking or which screens confuse doctors, DocForum collects
          minimal, aggregate product analytics. The contract is strict:
        </p>
        <ul style={{ marginTop: 'var(--space-3)', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <li><strong>Cookieless.</strong> No tracking cookies. The analytics endpoint receives only an aggregate count per page path.</li>
          <li><strong>Self-hosted.</strong> Data is sent only to an analytics endpoint <em>we</em> control. No third-party tracker (Plausible or Umami-compatible, self-hostable).</li>
          <li><strong>Explicit event allowlist.</strong> Only the events listed below can be tracked. No new event can be added without a code change and an update to this page.</li>
          <li><strong>No PHI, ever.</strong> No specialties, no search terms, no patient ids, no doctor ids, no order ids, no clinical text. Funnel events are bare counters — <code>booking_started</code>, not <code>booking_started_for_cardiology</code>.</li>
          <li><strong>Ids and tokens are scrubbed from URLs.</strong> The only URL portion recorded is the page path; query strings are dropped entirely, and path ids are replaced with <code>:id</code>.</li>
          <li><strong>Respects Do Not Track and Global Privacy Control.</strong> If your browser signals DNT=1 or GPC=true, analytics is disabled — no network call is made.</li>
          <li><strong>Disabled unless configured.</strong> No analytics is collected unless <code>VITE_ANALYTICS_ENDPOINT</code> is set at build time.</li>
        </ul>

        <h3 style={{ fontSize: 'var(--text-lg)', margin: 'var(--space-6) 0 var(--space-2)' }}>
          Events currently tracked
        </h3>
        <p style={{ color: 'var(--color-text-muted)', margin: '0 0 var(--space-3)', fontSize: 'var(--text-sm)' }}>
          This is the complete list. Each event is recorded with no personal properties unless the table says otherwise.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th scope="col" style={{ textAlign: 'left', padding: 'var(--space-2)', width: '40%' }}>Event</th>
              <th scope="col" style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Properties (non-PHI only)</th>
            </tr>
          </thead>
          <tbody>
            {ALLOWED_EVENTS.map((event) => (
              <tr key={event} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--space-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                  <code>{event}</code>
                </td>
                <td style={{ padding: 'var(--space-2)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                  {PROPERTIES_TEXT[event] ?? 'none'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', margin: '0 0 var(--space-3)' }}>
          What's not collected
        </h2>
        <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <li>Specialties searched for or booked.</li>
          <li>Doctor names, patient names, or any user id.</li>
          <li>Order ids, appointment ids, referral ids, escrow ids.</li>
          <li>Clinical text: notes, symptoms, diagnoses, medication names.</li>
          <li>Search queries or filter values entered in any table.</li>
          <li>Wallet addresses, transaction hashes, or escrow amounts.</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', margin: '0 0 var(--space-3)' }}>
          Current status
        </h2>
        <p>
          Analytics is currently <strong>{config.enabled ? 'enabled' : 'disabled'}</strong>
          {config.endpoint ? (
            <Fragment>
              {' '}and sending data to <code>{config.endpoint}</code>
              {config.domain ? ` (domain: ${config.domain})` : ''}.
            </Fragment>
          ) : (
            <Fragment>. No endpoint is configured, so no data is collected.</Fragment>
          )}
        </p>
        <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          To opt out even when configured, enable Do Not Track or Global Privacy Control in your browser. To inspect
          exactly what's collected, read <code>src/utils/analytics.ts</code> — the allowlist is enforced at the code
          level, not at the analytics server.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', margin: '0 0 var(--space-3)' }}>
          Your health records
        </h2>
        <p>
          Your health records are never used for analytics. You can download a complete copy of your data from the
          Account settings page, and you can permanently delete your account at any time. Clinical and statutory
          retention rules apply to anonymized records — see Account settings &gt; Delete account for details.
        </p>
      </section>
    </div>
  );
}

const PROPERTIES_TEXT: Record<string, string> = {
  signup_completed: 'role (patient or doctor only)',
  login_completed: 'role',
  booking_started: 'none',
  booking_completed: 'none',
  booking_abandoned: 'step name only (specialty_select, slot_select, intake_form, review)',
  referral_started: 'none',
  referral_accepted: 'none',
  referral_declined: 'none',
  order_placed: 'order type (prescription or lab)',
  order_fulfilled: 'order type',
  order_verified: 'verification result (valid, superseded, expired, fulfilled, not_eligible)',
  wallet_linked: 'none',
  data_export_requested: 'none',
  account_deleted: 'none',
  care_thread_viewed: 'none',
  admin_referral_reassigned: 'none',
  admin_referral_cancelled: 'none',
  privacy_page_viewed: 'none',
};
