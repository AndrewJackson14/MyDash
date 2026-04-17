-- Merch catalog, shop links, orders schema
-- See migration applied via MCP for full DDL
CREATE TABLE IF NOT EXISTS merch_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text, category text,
  base_cost numeric DEFAULT 0, sell_price numeric DEFAULT 0,
  image_url text, image_urls text[], supports_logo boolean DEFAULT false,
  logo_placement_note text, fulfillment_days integer DEFAULT 14,
  min_order_qty integer DEFAULT 1, is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merch_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES merch_products(id) ON DELETE CASCADE,
  label text NOT NULL, sku text, price_override numeric,
  is_available boolean DEFAULT true, sort_order integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS merch_shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, client_id uuid REFERENCES clients(id),
  access_token text UNIQUE DEFAULT gen_random_uuid()::text,
  product_ids uuid[], price_overrides jsonb DEFAULT '{}',
  logo_url text, header_text text, footer_text text,
  is_active boolean DEFAULT true, expires_at timestamptz,
  created_by uuid, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merch_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES merch_shops(id),
  client_id uuid REFERENCES clients(id),
  customer_name text, customer_email text, customer_phone text,
  shipping_address text, shipping_city text, shipping_state text, shipping_zip text,
  status text DEFAULT 'paid', subtotal numeric DEFAULT 0,
  shipping_cost numeric DEFAULT 0, total numeric DEFAULT 0,
  stripe_payment_intent_id text, stripe_session_id text,
  estimated_ship_date date, shipped_at timestamptz, delivered_at timestamptz,
  tracking_number text, notes text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merch_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES merch_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES merch_products(id),
  variant_id uuid REFERENCES merch_product_variants(id),
  product_name text NOT NULL, variant_label text,
  quantity integer DEFAULT 1, unit_price numeric DEFAULT 0,
  line_total numeric DEFAULT 0, logo_url text, notes text
);
