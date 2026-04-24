# MyDash Performance Review Page — Build Instructions

## Context

You are building a **Performance Review page** for MyDash, a publishing management system for 13 Stars Media. This is a React 18 + Vite app with Supabase backend. The codebase lives at `~/Documents/Dev/MyDash/`.

Before you begin, read these files to understand the architecture:
- `src/lib/theme.js` — design tokens (colors, typography, spacing, border-radius)
- `src/components/ui/Primitives.jsx` — shared UI components
- `src/App.jsx` — navigation structure and data flow
- `PERFORMANCE_PAGE_SPEC.md` — full spec for this feature

---

## What You're Building

A publisher-facing dashboard to track team performance across four departments:

### 1. Sales
| Metric | Description |
|--------|-------------|
| Lead-to-close % | Overall conversion rate from lead to closed sale |
| Client retention (30/60/90 rolling) | % of clients retained over each window |
| Revenue mix ratio | Existing (target 70%) vs New (target 30%) business |
| Upsell/cross-sell revenue | $ from expanded existing accounts |
| Revenue delta | Increase or decrease vs prior period |
| Touch frequency | Logged interactions on existing accounts |

**Accountability**: Each salesperson owns their own metrics.

### 2. Editorial
| Metric | Description |
|--------|-------------|
| Deadline-relative progress score | Weighted % complete vs. deadline (per story) |
| Late-breaking news weight | +30% importance multiplier |
| Team on-track % | Stories on pace for issue deadline |
| Individual throughput | Stories moved through stages, avg days-to-deadline |

**Stages**: Assigned → Draft → Edit → Ready (then Production takes over)

**Accountability**: Content Editor = 70%, Copy Editor = 30%

### 3. Production (Two Lanes)

**Layout Designer:**
| Metric | Description |
|--------|-------------|
| Deadline proximity | % of stories "On Page" vs % of compression window elapsed |

Compression window: **Ed Deadline → Pages Locked**

**Ad Designer:**
| Metric | Description |
|--------|-------------|
| Deadline proximity | % of ads Approved/Placed vs % of compression window elapsed |
| Revision count | Avg revisions per ad (lower = better quality) |

Compression window: **Ad Deadline → Pages Locked**

**Ad Lifecycle Stages** (from `src/pages/AdProjects.jsx`):
```
brief → awaiting_art → designing → proof_sent → revising → approved → signed_off → placed
```

### 4. Admin
| Metric | Description |
|--------|-------------|
| First response time | Target: ≤1 hour |
| Resolution time | Target: ≤48 hours |
| Volume cleared | Tickets closed vs opened per week |
| Net subscriber count | New subs minus cancellations |
| Churn rate | % subscribers lost per month |
| Renewal rate | % of expiring subs that renew |
| Subscription revenue | MRR / total subscription revenue |

**Accountability**: Office Administrator

---

## Database Changes Required

### 1. Add `pages_locked_date` to issues table
```sql
ALTER TABLE issues ADD COLUMN pages_locked_date DATE;
```

### 2. Add `first_response_at` to tickets table (if not present)
```sql
ALTER TABLE tickets ADD COLUMN first_response_at TIMESTAMPTZ;
```

### 3. Track ad revisions
Add to `ad_projects` table:
```sql
ALTER TABLE ad_projects ADD COLUMN revision_count INTEGER DEFAULT 0;
```

Put migration files in `supabase/migrations/`.

---

## UI Requirements

### Navigation
- Add "Performance" to sidebar nav under "Operations" section in `App.jsx`
- Permission: Publisher/Admin only

### Layout
- Department tabs across top: `Sales | Editorial | Production | Admin`
- Time period selector: `This Week | This Month | Custom Range`
- Team member filter dropdown (defaults to "All")

### Components to Use (from `src/components/ui/`)
- `GlassStat` — headline metric cards
- `GlassCard` — section containers
- `DataTable` — drill-down tables
- `TB` or `SolidTabs` — department tabs
- `Badge` — status indicators
- `PageHeader` — page title with controls

### Design Tokens (from `src/lib/theme.js`)
- Border radius: `R = 18` (cards), `Ri = 10` (buttons/inputs)
- Colors: `Z.go` (green/success), `Z.wa` (amber/warning), `Z.da` (red/danger)
- Typography: `DISPLAY` for large numbers, `COND` for labels, `FS.xxl` for stat values

### Color Coding for Progress
- Green (≥80% on track)
- Amber (50-79%)
- Red (<50%)

---

## Key Calculation: Deadline Proximity

```javascript
// For each item (story or ad):
const windowStart = new Date(edDeadline); // or adDeadline for ads
const windowEnd = new Date(pagesLockedDate);
const now = new Date();

const windowDuration = windowEnd - windowStart;
const timeElapsed = Math.max(0, now - windowStart);
const percentTimeElapsed = Math.min(100, (timeElapsed / windowDuration) * 100);

const stageWeights = {
  // Editorial
  'Assigned': 0, 'Draft': 25, 'Edit': 50, 'Ready': 75, 'On Page': 100,
  // Ad Production  
  'brief': 0, 'awaiting_art': 10, 'designing': 30, 'proof_sent': 50,
  'revising': 50, 'approved': 80, 'signed_off': 90, 'placed': 100
};

const percentComplete = stageWeights[item.status] || 0;

// Score: positive = ahead, negative = behind
const proximityScore = percentComplete - percentTimeElapsed;
```

---

## File Structure to Create

```
src/pages/Performance.jsx              # Main page with department tabs
src/pages/performance/
  SalesMetrics.jsx                     # Sales department content
  EditorialMetrics.jsx                 # Editorial department content  
  ProductionMetrics.jsx                # Production department content (both lanes)
  AdminMetrics.jsx                     # Admin department content
  usePerformanceData.js                # Hook to fetch/calculate all metrics
  deadlineProximity.js                 # Shared compression window calculator
```

---

## Implementation Order

1. Create Supabase migrations for schema changes
2. Update Publication modal to include `pages_locked_date` field
3. Create `Performance.jsx` shell with department tabs and time selector
4. Build `usePerformanceData.js` hook for data fetching
5. Implement `SalesMetrics.jsx` (most data already exists)
6. Implement `AdminMetrics.jsx` (tickets + subscriptions)
7. Implement `EditorialMetrics.jsx` (deadline proximity calc)
8. Implement `ProductionMetrics.jsx` (both Layout and Ad Designer lanes)
9. Add to App.jsx navigation
10. Test with live data

---

## Data Sources Reference

| Data | Table | Key Fields |
|------|-------|------------|
| Sales pipeline | `sales` | status, clientId, revenue, created_at |
| Clients | `clients` | id, name, created_at |
| Stories | `stories` | status, deadline, assignee, issue_id |
| Issues | `issues` | ed_deadline, ad_deadline, pages_locked_date, date |
| Publications | `publications` | id, name |
| Ad Projects | `ad_projects` | status, issue_id, revision_count, designer_id |
| Tickets | `tickets` | created_at, first_response_at, closed_at, status |
| Subscribers | `subscribers` | status, created_at, canceled_at, renewal_date |
| Team | `team` | id, name, role |

---

## Style Notes

- Use frosted glass aesthetic (`GlassCard`, `glass()` helper)
- Dark mode support is automatic via `Z` tokens
- Keep metrics scannable — big numbers, small labels
- Use sparklines for trend data (recharts)
- Drill-down tables should be sortable

---

## Questions to Resolve During Build

1. Does `tickets` table have `first_response_at`? If not, calculate from first entry in `ticket_comments`.
2. How is "new client" defined for revenue mix? Suggest: client created within last 90 days.
3. Should revision count increment on every status change to "revising", or track explicitly?

When in doubt, check existing patterns in `src/pages/Analytics.jsx` and `src/pages/Dashboard.jsx`.
