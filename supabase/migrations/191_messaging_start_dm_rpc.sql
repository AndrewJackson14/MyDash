-- ============================================================
-- 191_messaging_start_dm_rpc.sql
--
-- Atomic DM-create RPC. The client used to do a 2-step insert
-- (INSERT conversations RETURNING id, then INSERT both participants),
-- which hit two RLS chicken-and-eggs:
--
--   1. INSERT INTO conversations RETURNING id — the RETURNING is
--      subject to the SELECT policy is_convo_participant(id), which
--      is false at INSERT time because participants haven't been
--      added yet. PostgREST raises this as "new row violates row-
--      level security policy" even though the WITH CHECK passes.
--   2. INSERT both participants — the second row's WITH CHECK has
--      an EXISTS subquery against conversations, also subject to
--      the same SELECT policy.
--
-- SECURITY DEFINER lets the function bypass RLS on its own inserts.
-- Auth is enforced by my_person_id() (caller's identity) and a
-- not-self / not-NULL check on the other participant.
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_dm(p_other uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_person_id();
  v_existing uuid;
  v_convo uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'no_people_row' USING ERRCODE = 'P0001';
  END IF;
  IF p_other IS NULL OR p_other = v_me THEN
    RAISE EXCEPTION 'invalid_other_person' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM people WHERE id = p_other) THEN
    RAISE EXCEPTION 'other_person_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT mine.conversation_id
    INTO v_existing
    FROM conversation_participants mine
    JOIN conversations c ON c.id = mine.conversation_id AND c.type = 'dm'
    JOIN conversation_participants theirs
      ON theirs.conversation_id = mine.conversation_id
     AND theirs.member_id = p_other
   WHERE mine.member_id = v_me
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO conversations (type, created_by) VALUES ('dm', v_me) RETURNING id INTO v_convo;
  INSERT INTO conversation_participants (conversation_id, member_id, role)
  VALUES (v_convo, v_me, 'member'), (v_convo, p_other, 'member');

  RETURN v_convo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_dm(uuid) TO authenticated;
