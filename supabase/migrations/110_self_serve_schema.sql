-- ─────────────────────────────────────────────────────────────
-- Self-serve advertiser workflow — schema
-- See StellarPress Self-Serve Advertiser Workflow Spec v1.0
-- Stripe deferred to v2; no payment fields in v1.
-- site_id columns FK publications(id) since `sites` is a view.
-- ─────────────────────────────────────────────────────────────

-- 0. Enums
DO $$ BEGIN
  CREATE TYPE ad_product_type AS ENUM ('digital_display','print','newsletter_sponsorship','classifieds');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_booking_source AS ENUM ('self_serve','rep_mediated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_booking_status AS ENUM (
    'submitted','approved','scheduled','live','completed','rejected','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_creative_status AS ENUM (
    'pending_upload','uploaded','in_preflight','preflight_passed',
    'designer_approved','client_approved','rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. free_email_domains (global)
CREATE TABLE IF NOT EXISTS free_email_domains (
  domain      TEXT PRIMARY KEY,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. industries (per-publication)
CREATE TABLE IF NOT EXISTS industries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  markup_percent  NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT industries_site_slug_unique UNIQUE (site_id, slug),
  CONSTRAINT industries_markup_nonneg CHECK (markup_percent >= 0)
);

-- 3. local_zip_codes (per-publication)
CREATE TABLE IF NOT EXISTS local_zip_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  zip_code    TEXT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT local_zips_site_zip_unique UNIQUE (site_id, zip_code),
  CONSTRAINT local_zips_5digit CHECK (zip_code ~ '^[0-9]{5}$')
);

-- 4. advertisers (per-publication)
CREATE TABLE IF NOT EXISTS advertisers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  business_name     TEXT NOT NULL,
  business_domain   TEXT,
  primary_email     TEXT NOT NULL,
  phone             TEXT,
  billing_address   JSONB,
  industry_id       UUID REFERENCES industries(id) ON DELETE SET NULL,
  assigned_rep_id   UUID REFERENCES team_members(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS advertisers_site_email_unique
  ON advertisers (site_id, lower(primary_email));
CREATE INDEX IF NOT EXISTS advertisers_site_domain_idx
  ON advertisers (site_id, business_domain);
CREATE INDEX IF NOT EXISTS advertisers_assigned_rep_idx
  ON advertisers (assigned_rep_id) WHERE assigned_rep_id IS NOT NULL;

-- 5. advertiser_contacts (additional emails per advertiser)
CREATE TABLE IF NOT EXISTS advertiser_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id   UUID NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  role            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS advertiser_contacts_email_unique
  ON advertiser_contacts (advertiser_id, lower(email));
CREATE INDEX IF NOT EXISTS advertiser_contacts_email_lookup_idx
  ON advertiser_contacts (lower(email));

-- 6. ad_products (per-publication catalog)
CREATE TABLE IF NOT EXISTS ad_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  product_type      ad_product_type NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  ad_zone_id        UUID REFERENCES ad_zones(id) ON DELETE SET NULL,
  specs             JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_days     INTEGER NOT NULL DEFAULT 7,
  base_price_cents  INTEGER NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ad_products_price_nonneg CHECK (base_price_cents >= 0),
  CONSTRAINT ad_products_duration_positive CHECK (duration_days > 0)
);
CREATE INDEX IF NOT EXISTS ad_products_site_active_idx
  ON ad_products (site_id, product_type, sort_order)
  WHERE is_active = true;

-- 7. ad_bookings
CREATE TABLE IF NOT EXISTS ad_bookings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                 TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  advertiser_id           UUID NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
  booked_by_email         TEXT NOT NULL,
  booking_source          ad_booking_source NOT NULL DEFAULT 'self_serve',
  assigned_rep_id         UUID REFERENCES team_members(id) ON DELETE SET NULL,
  status                  ad_booking_status NOT NULL DEFAULT 'submitted',
  creative_status         ad_creative_status NOT NULL DEFAULT 'pending_upload',
  run_start_date          DATE,
  run_end_date            DATE,
  subtotal_cents          INTEGER NOT NULL,
  markup_applied          BOOLEAN NOT NULL DEFAULT false,
  markup_percent          NUMERIC(5,2),
  markup_amount_cents     INTEGER NOT NULL DEFAULT 0,
  discount_applied        BOOLEAN NOT NULL DEFAULT false,
  discount_percent        NUMERIC(5,2),
  discount_amount_cents   INTEGER NOT NULL DEFAULT 0,
  total_cents             INTEGER NOT NULL,
  billing_zip             TEXT,
  creative_asset_ids      UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  creative_notes          TEXT,
  rep_notes               TEXT,
  rejection_reason        TEXT,
  approved_by             UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at             TIMESTAMPTZ,
  share_token             UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ad_bookings_totals_nonneg CHECK (
    subtotal_cents >= 0 AND total_cents >= 0
    AND markup_amount_cents >= 0 AND discount_amount_cents >= 0
  ),
  CONSTRAINT ad_bookings_date_order CHECK (
    run_end_date IS NULL OR run_start_date IS NULL OR run_end_date >= run_start_date
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_bookings_share_token_unique
  ON ad_bookings (share_token);
CREATE INDEX IF NOT EXISTS ad_bookings_site_status_idx
  ON ad_bookings (site_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_bookings_advertiser_idx
  ON ad_bookings (advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_bookings_rep_idx
  ON ad_bookings (assigned_rep_id, status) WHERE assigned_rep_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_bookings_run_dates_idx
  ON ad_bookings (site_id, run_start_date, run_end_date) WHERE status IN ('approved','scheduled','live');

-- 8. ad_booking_line_items
CREATE TABLE IF NOT EXISTS ad_booking_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES ad_bookings(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES ad_products(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL DEFAULT 1,
  unit_price_cents  INTEGER NOT NULL,
  line_total_cents  INTEGER NOT NULL,
  run_start_date    DATE,
  run_end_date      DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT line_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT line_items_totals_nonneg CHECK (unit_price_cents >= 0 AND line_total_cents >= 0)
);
CREATE INDEX IF NOT EXISTS line_items_booking_idx
  ON ad_booking_line_items (booking_id);
CREATE INDEX IF NOT EXISTS line_items_product_idx
  ON ad_booking_line_items (product_id);

-- 9. resolve_advertiser_log (Postgres-backed rate limiting)
CREATE TABLE IF NOT EXISTS resolve_advertiser_log (
  id          BIGSERIAL PRIMARY KEY,
  ip          TEXT NOT NULL,
  email       TEXT,
  tier        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resolve_advertiser_log_ip_time_idx
  ON resolve_advertiser_log (ip, created_at DESC);
