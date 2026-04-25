-- 139_jen_p1_thread_reads.sql
--
-- P1.9: per-user "last read" stamp per thread, so AdProjects queue
-- cards can surface a 💬 N badge for unread project chat messages.
-- EntityThread upserts a row whenever the thread is opened; an RPC
-- bulk-counts unread messages across a list of thread ids in one
-- round trip (called from AdProjects on every project list change).

CREATE TABLE IF NOT EXISTS thread_reads (
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE thread_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS thread_reads_self ON thread_reads;
CREATE POLICY thread_reads_self ON thread_reads
  FOR ALL TO authenticated
  USING (user_id = (SELECT id FROM team_members WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM team_members WHERE auth_id = auth.uid()));

CREATE OR REPLACE FUNCTION unread_counts_for_threads(p_thread_ids uuid[], p_user_id uuid)
RETURNS TABLE(thread_id uuid, unread_count integer)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.thread_id, COUNT(*)::int AS unread_count
  FROM messages m
  WHERE m.thread_id = ANY(p_thread_ids)
    AND m.created_at > COALESCE(
      (SELECT last_read_at FROM thread_reads tr WHERE tr.thread_id = m.thread_id AND tr.user_id = p_user_id),
      '1970-01-01'::timestamptz
    )
    AND m.sender_name IS DISTINCT FROM (SELECT name FROM team_members WHERE id = p_user_id)
  GROUP BY m.thread_id;
$$;

REVOKE ALL ON FUNCTION unread_counts_for_threads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION unread_counts_for_threads(uuid[], uuid) TO authenticated, service_role;
