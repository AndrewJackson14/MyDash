# MyDash Code & Site Audit Protocol

Run this audit when asked to "run an audit" or "code and site audit." Execute each section, report findings, and fix issues found.

---

## 1. Build & Compile Check
- [ ] Run `npm run build` — zero errors, zero warnings
- [ ] Check bundle sizes — flag any chunk over 200KB
- [ ] Verify manual chunks split correctly (tiptap, framer)

## 2. Database Integrity
- [ ] Run Supabase advisors (security + performance)
- [ ] Check for missing RLS policies on all tables
- [ ] Check for orphaned data (foreign key references to deleted rows)
- [ ] Verify all indexes exist for frequently queried columns

## 3. Auth & Session
- [ ] Verify Supabase auth config (persistSession, autoRefreshToken)
- [ ] Confirm login page redirects when already authenticated
- [ ] Confirm logout clears session and redirects to login
- [ ] Check protected route guards for unauthenticated users

## 4. Routing & Navigation
- [ ] All sidebar/nav links resolve to valid routes
- [ ] No dead routes pointing to removed pages
- [ ] Protected routes redirect to login when unauthenticated
- [ ] Deep links work (direct URL to a specific page)

## 5. Core Modules
- [ ] Dashboard loads with correct data
- [ ] Stories/Editorial module: create, edit, list, search
- [ ] Media Library: upload, display, delete
- [ ] Calendar: events create and display
- [ ] Messaging: send, receive, real-time updates
- [ ] Team: member list, roles, permissions
- [ ] Billing/Payments: Stripe integration functional
- [ ] CRM/Sales: contacts, proposals load correctly
- [ ] Flatplan/Edition Manager: drag-and-drop works
- [ ] Ad Projects: create, track, list
- [ ] Service Desk: tickets create and display
- [ ] Analytics: data loads, charts render

## 6. Edge Functions
- [ ] All 16 edge functions deployed and active
- [ ] `bunny-storage`: uploads to BunnyCDN correctly
- [ ] `upload-image`: returns CDN URL
- [ ] `ai-proxy`: proxies requests correctly
- [ ] `stripe-webhook`: processes events
- [ ] `create-checkout-session` / `create-portal-session`: Stripe sessions work
- [ ] `gmail-api` / `gmail-auth`: OAuth flow works
- [ ] `qb-api` / `qb-auth`: QuickBooks integration works
- [ ] `generate-pdf`: PDF generation returns valid file
- [ ] `contract-email`: sends emails
- [ ] `invite-user`: creates invitation
- [ ] `gcal-api`: Google Calendar integration works
- [ ] `scheduled-tasks`: cron tasks execute
- [ ] `site-errors`: error reporting works

## 7. UI/UX Consistency
- [ ] Dark/light mode renders correctly across all pages
- [ ] Consistent card/panel styling throughout
- [ ] Responsive layout works on tablet and desktop
- [ ] TipTap editor renders and saves correctly
- [ ] Drag-and-drop (dnd-kit) works without visual glitches
- [ ] Framer Motion animations are smooth
- [ ] PDF viewer renders documents correctly

## 8. CI/CD & Deployment
- [ ] GitHub Actions workflow has all required VITE_ env vars
- [ ] Build succeeds in CI (npm ci + npm run build)
- [ ] Deploy via rsync to server works (push to `main` triggers
      [.github/workflows/deploy.yml](.github/workflows/deploy.yml))
- [ ] [mydash.media](https://mydash.media) loads after deploy

## 9. Security
- [ ] No secrets in frontend code (check src/, hardcoded keys)
- [ ] .env is in .gitignore
- [ ] RLS enabled on all user-facing tables
- [ ] Edge functions validate auth where required
- [ ] No XSS vectors in user-generated content (TipTap output, messages)
- [ ] File uploads validate on server

## 10. Performance
- [ ] No unnecessary re-renders (check useEffect deps)
- [ ] Images use loading="lazy" where appropriate
- [ ] Supabase queries use limits
- [ ] Real-time subscriptions clean up on unmount
- [ ] Large lists use virtualization (react-window)
- [ ] TipTap editor doesn't lag on large documents

---

## How to Report

For each section, report:
- **Pass**: Section is clean
- **Issues found**: List each issue with file:line reference
- **Fixed**: Mark after fixing

Fix obvious issues immediately. Flag anything that needs a decision for discussion.
