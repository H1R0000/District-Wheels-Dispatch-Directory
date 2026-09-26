-- Owner buyer access requires an OAuth-authenticated session. The owner's
-- only linked OAuth identity must be the verified H1R0000 GitHub identity.
-- This closes the email identity attached to the same Supabase Auth UUID.
create or replace function private.is_allowed_user()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        (p.role = 'demo' and p.is_demo and p.github_provider_id is null)
        or (
          p.role = 'owner' and not p.is_demo
          and ((select auth.jwt()) -> 'amr') @> '[{"method":"oauth"}]'::jsonb
          and exists (
            select 1 from auth.identities i
            where i.user_id = p.id and i.provider = 'github'
              and i.provider_id = p.github_provider_id
          )
          and not exists (
            select 1 from auth.identities i
            where i.user_id = p.id and i.provider not in ('github', 'email')
          )
        )
      )
  );
$$;
revoke all on function private.is_allowed_user() from public, anon;
grant execute on function private.is_allowed_user() to authenticated;
