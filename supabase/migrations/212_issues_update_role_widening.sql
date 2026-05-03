-- 212 — Allow Publishers, Content Editors, and Office Administrators to update issues
--
-- Page count edits in the flat plan are gated in the UI to these three
-- roles, but the underlying issues_write_upd policy only checks the
-- legacy admin permission flag. Publishers and the current Office
-- Administrator happen to carry admin in their permissions array, but
-- Content Editors do not — so their UI updates were silently failing.
--
-- Widen the UPDATE policy to also allow rows whose owner sits in those
-- three roles. INSERT and DELETE are intentionally untouched: only
-- admins should still be able to create or delete issues.

drop policy if exists "issues_write_upd" on issues;

create policy "issues_write_upd" on issues for update using (
  has_permission('admin') or exists (
    select 1 from people
    where auth_id = auth.uid()
      and role::text in ('Publisher', 'Content Editor', 'Office Administrator')
  )
);
