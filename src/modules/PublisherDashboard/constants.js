// PublisherDashboard/constants.js
// Pacing curve, alert thresholds, color maps. Single source — tune here,
// don't hardcode in components.

// Days-to-press → expected % of revenue goal sold by then.
// Linear interpolation between waypoints. Same curve for all 7 publications.
// Per spec: "Customizable pacing curve per publication" is out of scope for v1.
export const PACING_CURVE = [
  { daysToPress: 7, targetPct: 50 },
  { daysToPress: 5, targetPct: 70 },
  { daysToPress: 3, targetPct: 85 },
  { daysToPress: 1, targetPct: 95 },
];

// Pacing variance bands (actual_pct - target_pct).
// Used for issue card left-border color.
export const PACING_VARIANCE_BANDS = {
  GREEN_THRESHOLD: -5,    // variance >= -5 → green (on pace or ahead)
  AMBER_THRESHOLD: -15,   // -15 to -5 → amber (behind, recoverable)
  // < -15 → red (critical)
};

// Press timeline strip — daily load thresholds.
// Counts of distinct publications going to press on the same day.
export const PRESS_LOAD_BANDS = {
  EMPTY: 0,
  LIGHT: 1,        // 1 pub
  MEDIUM_MIN: 2,   // 2 pubs
  HEAVY_MIN: 3,    // 3+ pubs
};

// Alert banner severity colors. Conditional render — no banner = no severity.
export const ALERT_SEVERITY = {
  CRITICAL: 'critical',
  WARNING:  'warning',
};

// Activity stream — events we surface. Filters out noise (logins, page
// views, minor edits). Keys map to the event_type column on activity_log.
// Hayley reviews this list before realtime goes live (per spec).
export const ACTIVITY_EVENT_TYPES = {
  PROPOSAL_SENT:      'proposal_sent',
  CONTRACT_SIGNED:    'contract_signed',
  PROOF_APPROVED:     'proof_approved',
  STORY_FILED:        'story_filed',
  STORY_PUBLISHED:    'story_published',
  PAGE_BUILT:         'page_built',
  INVOICE_ISSUED:     'invoice_issued',
  COMMENT:            'comment',
  ESCALATION:         'escalation',
};

// Reverse lookup: event_type → display category (for filter UX later).
export const ACTIVITY_EVENT_CATEGORY = {
  proposal_sent:    'sales',
  contract_signed:  'sales',
  proof_approved:   'design',
  story_filed:      'editorial',
  story_published:  'editorial',
  page_built:       'production',
  invoice_issued:   'billing',
  comment:          'note',
  escalation:       'escalation',
};

// Activity stream pagination.
export const ACTIVITY_PAGE_SIZE = 50;

// Realtime debounce — avoid thrashing on bulk operations (mass invoice mint).
export const REALTIME_DEBOUNCE_MS = 250;

// Month at a Glance — threshold colors per metric.
export const MONTH_AT_A_GLANCE_BANDS = {
  REVENUE_GREEN_PCT: 95,   // >= 95% of goal → green
  REVENUE_AMBER_PCT: 80,   // 80-94% → amber, < 80% → red
  AR_GREEN_MAX:    5000,   // < $5k → green
  AR_AMBER_MAX:   15000,   // $5k-$15k → amber, > $15k → red
};

// Press timeline window — fixed 7-day strip.
export const PRESS_TIMELINE_DAYS = 7;
