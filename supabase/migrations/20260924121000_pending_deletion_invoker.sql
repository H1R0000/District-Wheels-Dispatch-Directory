-- The caller can only manipulate its own pending confirmation under RLS.
-- Both RPCs still enforce the app allowlist and buyer ownership.
alter table private.pending_buyer_deletions enable row level security;
grant select, insert, update, delete on private.pending_buyer_deletions to authenticated;
create policy pending_deletions_own on private.pending_buyer_deletions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

alter function public.prepare_buyer_deletion(text) security invoker;
alter function public.confirm_buyer_deletion(text) security invoker;
