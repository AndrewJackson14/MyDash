-- ============================================================
-- 190_messaging_core_schema.sql
--
-- Ports the portable messaging package (extracted from HALO; in
-- /messaging/ at repo root) into MyDash. Keys to people(id) instead
-- of HALO's members(id). Adds RLS using the existing my_person_id()
-- SECURITY DEFINER helper to avoid recursion through people.
--
-- Coexists with team_notes (the existing per-context "ping a team
-- member" system used by TeamMemberPanel + RoleDashboard). team_notes
-- stays as the tagged-task ping system; this is the richer chat
-- system intended for the mobile rep app and future general DM /
-- group surfaces.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type = ANY (ARRAY['dm', 'group', 'room'])),
  name text,
  description text,
  created_by uuid REFERENCES public.people(id),
  disappearing_timer text NOT NULL DEFAULT 'off'
    CHECK (disappearing_timer = ANY (ARRAY['off', '1h', '1d', '7d', '30d'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role = ANY (ARRAY['admin', 'member'])),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_convo_participants_member
  ON public.conversation_participants(member_id);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.people(id),
  message text NOT NULL,
  expires_at timestamptz,
  edited_at timestamptz,
  file_url text,
  file_name text,
  file_size integer,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_convo_msgs_convo
  ON public.conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_convo_msgs_expires
  ON public.conversation_messages(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.conversation_read_cursors (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, member_id)
);

ALTER TABLE public.conversations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_read_cursors   ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper so participant lookups don't recurse through
-- conversation_participants RLS.
CREATE OR REPLACE FUNCTION public.is_convo_participant(p_convo uuid)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_convo
      AND cp.member_id = my_person_id()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_convo_participant(uuid) TO authenticated;

-- conversations: read if participant, insert with self as creator,
-- update if participant.
CREATE POLICY conversations_read ON public.conversations
  FOR SELECT TO authenticated USING (is_convo_participant(id));
CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (created_by = my_person_id());
CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (is_convo_participant(id))
  WITH CHECK (is_convo_participant(id));

-- conversation_participants: read participants of conversations you're
-- in; insert yourself OR (when you created the conversation) anyone;
-- delete only yourself (leave a conversation).
CREATE POLICY conversation_participants_read ON public.conversation_participants
  FOR SELECT TO authenticated USING (is_convo_participant(conversation_id));
CREATE POLICY conversation_participants_insert ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = my_person_id()
    OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.created_by = my_person_id())
  );
CREATE POLICY conversation_participants_delete ON public.conversation_participants
  FOR DELETE TO authenticated USING (member_id = my_person_id());

-- conversation_messages: read if participant; insert as self into a
-- conversation you're in; update + delete only your own.
CREATE POLICY conversation_messages_read ON public.conversation_messages
  FOR SELECT TO authenticated USING (is_convo_participant(conversation_id));
CREATE POLICY conversation_messages_insert ON public.conversation_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = my_person_id() AND is_convo_participant(conversation_id));
CREATE POLICY conversation_messages_update ON public.conversation_messages
  FOR UPDATE TO authenticated
  USING (sender_id = my_person_id()) WITH CHECK (sender_id = my_person_id());
CREATE POLICY conversation_messages_delete ON public.conversation_messages
  FOR DELETE TO authenticated USING (sender_id = my_person_id());

-- read cursors: own only.
CREATE POLICY conversation_read_cursors_read ON public.conversation_read_cursors
  FOR SELECT TO authenticated USING (member_id = my_person_id());
CREATE POLICY conversation_read_cursors_write ON public.conversation_read_cursors
  FOR ALL TO authenticated
  USING (member_id = my_person_id()) WITH CHECK (member_id = my_person_id());

-- Realtime so useConvoMessages can subscribe to INSERT/UPDATE/DELETE.
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;

NOTIFY pgrst, 'reload schema';
