# 13 Stars Media — MyDash

Publishing management system for 13 Stars Media. Live at **[mydash.media](https://mydash.media)**.

## Workflow
MyDash is developed and verified directly against production. Commit your
changes, push to `main`, and GitHub Actions deploys to
[mydash.media](https://mydash.media) — that is the only environment.
There is no local dev server in the workflow.

```bash
npm install  # only needed if you touch dependencies locally
```

## Deploy
Pushes to `main` deploy automatically via GitHub Actions
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)): `npm run build`
then rsync `dist/` over SSH to the production server behind
[mydash.media](https://mydash.media).

Required repo secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_STRIPE_PUBLIC_KEY`, `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`.

## Architecture
- React 18 + Vite
- Single-file app (App.jsx) — ready to split into components
- AI tools via Anthropic API (Claude Sonnet)
- Prepared for: Database (PostgreSQL), Google Workspace, QuickBooks

## Features
- Dashboard with revenue analytics
- Publications & rate cards (editable)
- Issue schedule with ad/editorial deadlines
- Stories (inline spreadsheet editor)
- Sales & CRM pipeline (kanban + proposals)
- Calendar (day/week/month views)
- Flatplan (2D grid layout)
- Editorial desk (AI spell/grammar/AP style)
- Team management (20 members, 16 roles)
- Integrations hub (Gmail, QuickBooks, social)
