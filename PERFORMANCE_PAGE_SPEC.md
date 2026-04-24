# Performance Review Page — Build Spec

## Overview

A publisher-facing dashboard to track team performance across four departments: **Sales**, **Editorial**, **Production**, and **Admin**. The goal is deadline proximity, conversion ratios, and velocity — not activity counts.

---

## Navigation & Layout

- **Location**: Add to sidebar nav under "Operations" section as "Performance"
- **Permission**: Publisher/Admin only (add to NAV filter in App.jsx)
- **Layout**: 
  - Department tabs across top: `Sales | Editorial | Production | Admin`
  - Time period selector: `This Week | This Month | Custom Range`
  - Team member filter dropdown (optional, defaults to "All")

---

## Department: Sales

### Accountability
- Each salesperson owns their metrics individually

### Metrics

| Metric | Calculation | Display |
|--------|-------------|---------|
| **Lead-to-Close %** | (Closed sales / Total leads) × 100 | Percentage with trend arrow |
| **Client Retention (30/60/90)** | % of clients with active ads in rolling windows | Three gauges or sparkline |
| **Revenue Mix Ratio** | Existing client revenue vs New client revenue | Stacked bar, target line at 70/30 |
| **Upsell/Cross-sell Revenue** | $ from expanded existing accounts | Currency with delta |
| **Revenue Delta** | Current period vs prior period | +/- percentage |
| **Touch Frequency** | Logged interactions on existing accounts | Count per client avg |

### Data Sources
- `sales` table — status, clientId, revenue, created_at
- `clients` table — created_at (to determine new vs existing)
- `client_actions` or activity log — touches
- Pipeline stages from `src/pages/sales/constants.js`: Discovery → Presentation → Proposal → Negotiation → Closed → Follow-up

---

## Department: Editorial

### Accountability
- **Content Editor**: 70% of department performance
- **Copy Editor**: 30% of department performance
- Team-level view with individual drill-down

### Metrics

| Metric | Calculation | Display |
|--------|-------------|---------|
| **Deadline-Relative Progress Score** | Per story: (% complete) vs (% of time elapsed to deadline) | Weighted average across all stories |
| **Late-Breaking News Weight** | +30% importance multiplier for dropped-in stories | Flag on story, affects aggregate |
| **Team On-Track %** | Stories on pace for issue deadline | Percentage gauge |
| **Individual Throughput** | Stories moved through stages, avg days-to-deadline | Per-editor breakdown |

### Story Stages (Editorial owns)
- Assigned → Draft → Edit → Ready

### Weighting
- All stories equal weight
- Late-breaking news: +30% weight

### Data Sources
- `stories` table — status, deadline, assignee, updated_at
- `issues` table — ed_deadline, date
- `team` table — role (Content Editor, Copy Editor)

---

## Department: Production

### Two Lanes
1. **Layout Designer** — stories from Ready → On Page
2. **Ad Designer** — ads from Brief → Placed

### Layout Designer Metrics

| Metric | Calculation | Display |
|--------|-------------|---------|
| **Deadline Proximity** | % stories "On Page" vs % of compression window elapsed | Progress bar or gauge |

**Compression Window**: Ed Deadline → Pages Locked deadline

### Ad Designer Metrics

| Metric | Calculation | Display |
|--------|-------------|---------|
| **Deadline Proximity** | % ads Approved/Placed vs % of compression window elapsed | Progress bar or gauge |
| **Revision Count** | Avg revisions per ad (quality metric, lower = better) | Number with trend |

**Compression Window**: Ad Deadline → Pages Locked deadline

### Ad Lifecycle Stages (from AdProjects.jsx)
```
brief → awaiting_art → designing → proof_sent → revising → approved → signed_off → placed
```

### Publication Setting Required (NEW)
- **Pages Locked deadline** — add to Publication settings modal
  - Newspapers: consistent weekly schedule (e.g., "Tuesdays 5pm")
  - Magazines: per-issue date set by publisher

### Data Sources
- `stories` table — status, issue_id
- `ad_projects` table — status, issue_id, revision count (track in proofs or status changes)
- `issues` table — ed_deadline, ad_deadline
- `publications` table — **needs `pages_locked_offset` or per-issue `pages_locked_date`**

---

## Department: Admin

### Accountability
- **Office Administrator** — single owner

### Metrics

| Metric | Calculation | Display |
|--------|-------------|---------|
| **First Response Time** | Avg time from ticket created to first reply | Target: ≤1 hour |
| **Resolution Time** | Avg time from ticket created to closed | Target: ≤48 hours |
| **Volume Cleared** | Tickets closed vs opened per period | Ratio or net number |
| **Net Subscriber Count** | New subs − cancellations | Number with delta |
| **Churn Rate** | % subscribers lost per month | Percentage |
| **Renewal Rate** | % of expiring subs that renewed | Percentage |
| **Subscription Revenue** | MRR or total subscription revenue | Currency with trend |

### Not Tracked
- Legals/Classifieds (arbitrary, pass-through)
- Delivery routes (vendor-managed)
- Refunds/Deposits (operational, not KPI'd)

### Data Sources
- `tickets` table — created_at, first_response_at, closed_at, status
- `ticket_comments` table — created_at (for first response calc)
- `subscribers` table — status, created_at, canceled_at, renewal_date
- `subscription_payments` table — amount, date

---

## UI Components

### Stat Cards
Use existing `GlassStat` component for headline numbers:
- Large number (FS.xxl, DISPLAY font)
- Muted label above
- Trend indicator (↑↓) with color coding

### Progress Gauges
For deadline proximity and on-track percentages:
- Circular or linear progress bar
- Color: green (≥80%), amber (50-79%), red (<50%)

### Trend Sparklines
For rolling metrics (retention, revenue):
- Small inline chart showing 30/60/90 day trend
- Use recharts `<Sparkline>` or simple SVG path

### Data Tables
For drill-down into individual team members:
- Use existing `DataTable` component
- Sortable columns
- Click row to expand details

### Department Tabs
Use existing `TB` or `SolidTabs` component

---

## Database Changes Required

### New: `publications` table columns
```sql
ALTER TABLE publications ADD COLUMN pages_locked_offset INTEGER DEFAULT 0;
-- OR for per-issue flexibility:
ALTER TABLE issues ADD COLUMN pages_locked_date DATE;
```

### New: `tickets` table columns (if not present)
```sql
ALTER TABLE tickets ADD COLUMN first_response_at TIMESTAMPTZ;
```

### New: Track ad revisions
Either:
- Add `revision_count` to `ad_projects`
- Or count status changes to "revising" in `ad_proofs` history

---

## File Structure

```
src/pages/Performance.jsx          # Main page component
src/pages/performance/
  SalesMetrics.jsx                 # Sales department tab
  EditorialMetrics.jsx             # Editorial department tab  
  ProductionMetrics.jsx            # Production department tab
  AdminMetrics.jsx                 # Admin department tab
  MetricCard.jsx                   # Reusable stat card with trend
  ProgressGauge.jsx                # Circular/linear progress component
  DeadlineProximity.jsx            # Shared compression window calculator
```

---

## Calculation Logic

### Deadline-Relative Progress Score (Editorial & Production)

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

// Aggregate: weighted average across all items in period
// Late-breaking news items get 1.3x weight
```

### Client Retention (Sales)

```javascript
// Rolling window retention
const retention30 = clients.filter(c => 
  hasActiveAdInWindow(c.id, 30)
).length / totalClients * 100;

const retention60 = clients.filter(c => 
  hasActiveAdInWindow(c.id, 60)
).length / totalClients * 100;

const retention90 = clients.filter(c => 
  hasActiveAdInWindow(c.id, 90)
).length / totalClients * 100;
```

### Revenue Mix (Sales)

```javascript
const existingClientRevenue = sales
  .filter(s => s.status === 'Closed' && !isNewClient(s.clientId))
  .reduce((sum, s) => sum + s.revenue, 0);

const newClientRevenue = sales
  .filter(s => s.status === 'Closed' && isNewClient(s.clientId))
  .reduce((sum, s) => sum + s.revenue, 0);

const totalRevenue = existingClientRevenue + newClientRevenue;
const existingPct = (existingClientRevenue / totalRevenue) * 100;
// Target: 70% existing, 30% new
```

---

## Implementation Order

1. **Phase 1**: Add `pages_locked_date` to issues table + Publication modal
2. **Phase 2**: Build Performance.jsx shell with department tabs
3. **Phase 3**: Sales metrics (most data already exists)
4. **Phase 4**: Admin metrics (tickets + subscriptions)
5. **Phase 5**: Editorial metrics (deadline proximity calc)
6. **Phase 6**: Production metrics (both lanes)
7. **Phase 7**: Individual drill-down views

---

## Notes

- All metrics should support export to CSV for external reporting
- Consider adding email digest: weekly performance summary to publisher
- Future: Goal-setting UI where publisher can adjust targets (e.g., 70/30 ratio, 1hr response time)
