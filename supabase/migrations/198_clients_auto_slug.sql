-- 198_clients_auto_slug.sql
-- Mig 194 added clients.slug NOT NULL but didn't update every INSERT
-- path. submit_self_serve_proposal in particular still inserts without
-- a slug, so every fresh self-serve submit on the live pub sites
-- fails with a NOT NULL violation. Joint smoke after the StellarPress
-- cutover surfaced it.
--
-- Fixing structurally with a BEFORE INSERT/UPDATE trigger so any path
-- (RPC, staff-app insert, future code) gets a slug auto-populated
-- when NULL, with collision suffix handling.
--
-- Helper function reuses the backfill algorithm from mig 194 §1.2.

CREATE OR REPLACE FUNCTION public.generate_client_slug(p_name text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug      text;
  candidate_slug text;
  counter        int := 1;
BEGIN
  base_slug := lower(regexp_replace(coalesce(p_name, 'unnamed'), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substring(base_slug from 1 for 64);
  IF base_slug IS NULL OR base_slug = '' THEN
    base_slug := 'client-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  candidate_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.clients WHERE slug = candidate_slug) LOOP
    counter := counter + 1;
    candidate_slug := base_slug || '-' || counter;
  END LOOP;
  RETURN candidate_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.clients_auto_slug_tg()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_client_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_auto_slug ON public.clients;
CREATE TRIGGER clients_auto_slug
BEFORE INSERT OR UPDATE OF name ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.clients_auto_slug_tg();

COMMENT ON FUNCTION public.generate_client_slug IS
  'Builds a URL-safe unique slug from a client name with -<n> collision suffix. Returns ''client-<8hex>'' if name yields an empty slug.';
COMMENT ON TRIGGER clients_auto_slug ON public.clients IS
  'Auto-fills clients.slug on INSERT or name UPDATE if NULL or empty. Prevents NOT NULL violations from any insert path that forgets the column.';
