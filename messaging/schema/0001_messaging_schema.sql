-- Messaging core schema. Self-contained except for the user-table FK,
-- which references public.members. Replace `members` with your host
-- application's user table everywhere it appears below.

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type = ANY (ARRAY['dm', 'group', 'room'])),
  name text,
  description text,
  created_by uuid REFERENCES public.members(id),
  disappearing_timer text NOT NULL DEFAULT 'off'
    CHECK (disappearing_timer = ANY (ARRAY['off', '1h', '1d', '7d', '30d'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
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
  sender_id uuid NOT NULL REFERENCES public.members(id),
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
  ON public.conversation_messages(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.conversation_read_cursors (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, member_id)
);

-- Realtime: hooks subscribe to conversation_messages.
-- Run once after creating the tables:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;
