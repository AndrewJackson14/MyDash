# 13 Stars Media — MyDash

Publishing management system for 13 Stars Media.

## Setup
```bash
npm install
npm run dev
```

## Deploy
```bash
npm run build
# Deploy the `dist/` folder to Vercel, Netlify, or any static host
```

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
