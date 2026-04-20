-- ============================================================
-- MyHelper onboarding blast
--
-- Sends a one-time intro DM from MyHelper to every active team
-- member so they know the bot exists and learn the Cmd+/ shortcut.
--
-- Idempotent: uses WHERE NOT EXISTS on (from_user=MyHelper, to_user)
-- so re-running the migration won't spam duplicate intros.
-- ============================================================

INSERT INTO team_notes (from_user, to_user, message, context_type, context_id, is_read)
SELECT
  '13b6fd61-4215-4813-9058-762c10d24e1a'::uuid AS from_user,
  tm.id AS to_user,
  E'Hi ' || split_part(tm.name, ' ', 1) || E'! I''m MyHelper — the in-app assistant for MyDash.\n\n' ||
  E'Press ⌘+/ (Mac) or Ctrl+/ (Windows) anywhere in the app to ask me a question — how to find something, how a workflow works, where a button lives. I''ll answer from the MyDash docs.\n\n' ||
  E'If I can''t answer, I''ll ping MySupport so someone on the team can help directly.' AS message,
  NULL AS context_type,
  NULL AS context_id,
  false AS is_read
FROM team_members tm
WHERE tm.is_active = true
  AND tm.id <> '13b6fd61-4215-4813-9058-762c10d24e1a'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM team_notes tn
    WHERE tn.from_user = '13b6fd61-4215-4813-9058-762c10d24e1a'::uuid
      AND tn.to_user = tm.id
  );
