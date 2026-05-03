# Portal deploy notes — `portal.13stars.media`

**Status:** Phase B (scaffolding) complete. Phase C (auth flow pages)
not started. The bundle builds and routes; pages render placeholders.

**Spec:** [`docs/specs/client-portal-spec.md.md`](specs/client-portal-spec.md.md) §11 phase plan.

---

## Build

```bash
npm run build:portal       # → dist-portal/
npm run dev:portal         # local dev on http://localhost:5174
```

`vite.config.portal.js` is the entry — independent from staff
`vite.config.js`. Source lives at `src/portal/` and shares
`src/lib/supabase.js` etc. with the staff app.

`dist-portal/` is gitignored.

---

## v1 deploy path (single-bundle)

Per spec §1.2, v1 keeps the existing single-repo layout — no pnpm
workspace refactor. The portal config produces its own static bundle
that drops onto a separate webroot.

```
mydash repo
├── dist/            ← npm run build         → mydash.media (RunCloud webapp)
└── dist-portal/     ← npm run build:portal  → portal.13stars.media (RunCloud webapp)
```

**v2 cleanup:** refactor to `apps/staff/` + `apps/portal/` with pnpm
workspaces. Out of scope for Phase B.

---

## User-action items (cannot be done from the agent)

These must be configured outside the codebase before the portal can
serve traffic. Order doesn't matter — do them in parallel.

### 1. DNS — add an A or CNAME record

**Where:** wherever `13stars.media` DNS is managed (likely the same
provider that hosts `cdn.13stars.media`).

```
portal.13stars.media   A      <UpCloud server IP>
                       or
portal.13stars.media   CNAME  <existing UpCloud hostname>
```

Confirm propagation with `dig portal.13stars.media`.

### 2. RunCloud — provision the webapp + SPA fallback

**Where:** RunCloud panel → server hosting `mydash.media` (same UpCloud
box per existing pattern).

- New webapp → static site
- Domain: `portal.13stars.media`
- Webroot: `/home/stars/webapps/portal/` (or whatever the convention is)
- Issue Let's Encrypt SSL via the panel (it auto-renews)

**Critical: SPA fallback rewrite.** React Router uses real URLs
(`/login`, `/setup/complete`), so any deep link must be rewritten to
`/index.html`. Without this, refreshing or sharing a portal URL
returns 404. In RunCloud → webapp → Nginx Config → add to the main
`location /` block (or pick the "Single Page Application" template if
RunCloud offers one):

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

**Smoke test:**

```bash
curl -I https://portal.13stars.media/login
# Expect: HTTP/2 200, content-type: text/html (NOT 404)
```

### 3. GitHub Actions / deploy step (optional for v1, recommended)

If `mydash.media` deploys via GitHub Actions, add a parallel job that
runs `npm run build:portal` and rsyncs `dist-portal/` to the portal
webroot. If deploy is manual today, this can wait — `scp dist-portal/*`
from a workstation works for v1.

Sketch for `.github/workflows/deploy.yml`:

```yaml
- name: Build portal
  run: npm run build:portal
- name: Deploy portal
  run: rsync -azv --delete dist-portal/ stars@<server>:/home/stars/webapps/portal/
```

### 4. Supabase Auth — allowlist the portal redirect URL

**Where:** Supabase dashboard → Project `MyDash` → Authentication →
URL Configuration.

- **Site URL:** keep current (`https://mydash.media`)
- **Additional Redirect URLs:** add
  - `https://portal.13stars.media/**`
  - `https://portal.13stars.media/setup/complete`
  - (optional during dev) `http://localhost:5174/**`

Without this, the magic link emitted by `send-portal-setup-email` will
land on a "redirect URL not allowed" error page.

### 5. Supabase Auth — confirm SMTP sender

The magic link is dispatched via Supabase Auth's configured email
provider. If the project still uses the built-in low-volume sender,
the daily/hourly cap will throttle the one-time outreach to existing
customers (spec §9.1 batches 50/day to respect this). For higher
volume, switch to Resend or SES in the Auth → Email Templates panel.

### 6. (Phase C) Set magic-link email template copy

Per spec §7, two templates needed:
- §7.1 generic Sign-in
- §7.2 post-self-serve-submit Set-up
- §7.3 invitation

Supabase Auth supports a single magic-link template — use §7.1's body
verbatim and let the portal landing pages provide context. Multi-template
is v2 (custom send via `send-portal-setup-email`).

### 7. (Phase D) Configure `publications.theme_config`

Per-pub theme tokens drive the card-level branding in portal proposals/
ad-projects/invoices lists. Spec §6.1 expects keys:

```json
{
  "primary_color":      "#1A2B3C",
  "accent_color":       "#F0A020",
  "logo_url":           "https://cdn.13stars.media/.../logo.svg",
  "logo_url_inverse":   "https://cdn.13stars.media/.../logo-white.svg"
}
```

If `publications.theme_config` doesn't yet have this shape across all
nine publications, populate it before Phase D lands.

---

## Phase C/D agent handoff

The portal app shell expects these routes to exist (currently
placeholder stubs):

- `/login` — magic-link primary, password collapsed (spec §5.1)
- `/setup` — public token-redemption form (spec §5.2)
- `/setup/sent` — "check your email" landing (spec §9.3)
- `/setup/complete?token=<uuid>` — calls `complete_portal_setup` RPC
- `/c/<slug>/home` — home dashboard (spec §5.4)

Phase C builds 1-4. Phase D adds `/c/<slug>/{proposals,ad-projects,
invoices,account,activity}` per spec §5.5–5.10.

All RPCs are deployed and curl-tested as of Phase A
(commit `b76e58a` — `feat(portal): phase A backend`).
