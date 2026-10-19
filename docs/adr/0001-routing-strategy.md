# ADR 0001 — Routing strategy: HashRouter vs BrowserRouter

**Date:** 2026-10-19  
**Status:** Implemented (configurable)  
**Issue:** [#119](https://github.com/DocForum/docforum-web/issues/119)

---

## Context

`docforum-web` currently uses `HashRouter` (`/#/path`) because GitHub Pages
cannot rewrite client-side routes — a direct visit to `/login` returns 404.
Hash-based routing has real costs:

- **Ugly URLs.** `/#/doctor/insights` does not look professional or clinical.
- **Emailed links.** The backend (`docforum-core`) generates links for
  password-reset, invite, and verification emails. `HashRouter` requires
  all links to be `…/#/claim-account?token=…` instead of
  `…/claim-account?token=…`. Any backend link generated without `/#` will
  arrive as a 404 and the user's token is lost.
- **Analytics.** Several analytics tools (including Plausible) parse the
  window location's `pathname`, not the hash. The analytics module in this
  repo (`src/utils/analytics.ts`) already special-cases hash routes in
  `scrubUrl`; that workaround goes away with `BrowserRouter`.
- **Deep links.** A deep link in a shared document, an SMS, or a `<a href>` in
  another app will be malformed or duplicated unless every caller knows to
  prefix `#`.

The app currently deploys exclusively to GitHub Pages. If it moves to a
host that supports rewrite rules (Netlify, Cloudflare Pages, Vercel,
behind `docforum-core` itself), `BrowserRouter` is strictly better.

---

## Decision

**Implement a configurable router: `BrowserRouter` by default; fall back
to `HashRouter` when `VITE_USE_HASH_ROUTER=true` is set at build time.**

GitHub Pages is the only current deployment target, so `deploy-pages.yml`
continues to set `VITE_USE_HASH_ROUTER=true`. When any other deployment
target is adopted, that flag is simply dropped from the build command.

**Old hash links keep working** via a redirect shim (`HashRedirectShim`
component) mounted in `BrowserRouter` mode. It detects an initial location
whose path is `/` and whose hash looks like `#/some/path` (an old emailed
link or bookmark), replaces the hash route with a real path, and performs
a client-side `history.replace` so the URL is clean before any component
renders. This handles links already sent in emails; no server-side
intervention is required.

---

## Options considered

### Option A — Stay on HashRouter forever
- Simplest. No migration risk.
- Emailed links, analytics, and deep links remain broken unless every
  system knows to use `#/`. Makes `docforum-core` responsible for knowing
  about the frontend's routing quirk forever.
- **Rejected**: doesn't scale as the product matures.

### Option B — Switch to BrowserRouter unconditionally
- Cleanest URLs everywhere.
- Requires the GitHub Pages deploy to add a `404.html` redirect hack
  (a widely used approach that copies `index.html` to `404.html` and
  encodes the path in a query string, then decodes it on load).
- The `404.html` approach is fragile and an open redirect in some
  configurations; it has confused users in multiple public postmortems.
- **Rejected**: Pages deploy risk without a proper server-side rewrite.

### Option C — Configurable router + hash-redirect shim (chosen)
- Zero Pages-deploy risk: the flag keeps hash routing for Pages exactly
  as today, and the shim means old links don't break if the flag ever flips.
- `docforum-core` only generates clean paths (no `#`) for emails and invite
  links, because those will always be served by a rewrite-capable host.
- Removes the routing-implementation concern from `docforum-core` entirely
  (it doesn't need to know the frontend's router choice).
- Single boolean flag to flip when the hosting story changes.

---

## Consequences

### Positive
- Deployment paths stay exactly the same for GitHub Pages.
- New deployments (Netlify/Cloudflare/behind `docforum-core`) get clean
  history-API routing for free, with no code change.
- `docforum-core` email/invite link generation uses clean paths from day one.
- Analytics and deep links work correctly everywhere.
- Old `#/path` bookmarks and emailed links transparently redirect.

### Negative / risks
- The flag is `VITE_USE_HASH_ROUTER`, set at build time. A misconfigured
  build (Pages build missing the flag) would serve history-API routes on
  a host with no rewrite, causing 404s on refresh. CI does not catch this
  because it runs `npm run build` (no flag), not `build:pages`. Mitigation:
  `deploy-pages.yml` sets the flag explicitly in the `npm run build:pages`
  step.
- The hash-redirect shim runs on every page load in BrowserRouter mode
  (zero-cost: it's a single `if` on a location check) but is dead code in
  HashRouter mode.

---

## Implementation

See `src/main.tsx` (router selection), `src/components/HashRedirectShim.tsx`
(redirect logic), and `.github/workflows/deploy-pages.yml` (flag injection).

---

## Follow-up

When `docforum-core` generates emailed links (invites, password reset,
verify), those paths should be plain paths (`/claim-account?token=…`) —
not hash-prefixed. This ADR and the shim handle any previously-sent links
automatically; new links from a fresh deployment need no special handling.
