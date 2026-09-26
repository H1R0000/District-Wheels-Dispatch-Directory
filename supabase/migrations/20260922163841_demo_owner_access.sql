-- Demo and owner allowlist for District Wheels.
-- Existing buyer rows are never rewritten by this migration.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null unique check (role in ('owner', 'demo')),
  is_demo boolean not null,
  github_provider_id text,
  created_at timestamptz not null default now(),
  constraint profile_role_matches_demo check (
    (role = 'owner' and not is_demo and github_provider_id is not null)
    or (role = 'demo' and is_demo and github_provider_id is null)
  )
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
create policy profiles_read_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Resolve the verified GitHub identity to its existing Auth UUID at migration
-- time. Never create a replacement owner or reassign existing buyer rows.
do $$
declare owner_uuid uuid;
begin
  select i.user_id into owner_uuid from auth.identities i
  where i.provider = 'github' and i.provider_id = '185481992';
  if owner_uuid is null then
    raise exception 'Verified H1R0000 GitHub identity is missing';
  end if;
  if exists (select 1 from public.buyers where owner_id <> owner_uuid) then
    raise exception 'Unexpected buyer owner; inspect before applying allowlist';
  end if;
  insert into public.profiles (id, role, is_demo, github_provider_id)
  values (owner_uuid, 'owner', false, '185481992');
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.is_allowed_user()
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
          and exists (
            select 1 from auth.identities i
            where i.user_id = p.id and i.provider = 'github'
              and i.provider_id = p.github_provider_id
          )
        )
      )
  );
$$;
revoke all on function private.is_allowed_user() from public, anon;
grant execute on function private.is_allowed_user() to authenticated;

-- Restrictive policies add the allowlist to the existing ownership policies.
-- Child row policies already depend on visibility of the parent buyer row.
create policy buyers_allowlisted on public.buyers as restrictive
  for all to authenticated
  using ((select private.is_allowed_user()))
  with check ((select private.is_allowed_user()));
create policy audit_allowlisted on public.audit_logs as restrictive
  for all to authenticated
  using ((select private.is_allowed_user()))
  with check ((select private.is_allowed_user()));
create policy postal_allowlisted on public.postal_codes as restrictive
  for select to authenticated
  using ((select private.is_allowed_user()));

create function private.keep_buyer_owner()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Buyer ownership cannot be changed';
  end if;
  return new;
end;
$$;
create trigger buyers_owner_immutable before update on public.buyers
  for each row execute function private.keep_buyer_owner();
revoke all on function private.keep_buyer_owner() from public, anon, authenticated;

-- Only the server's service-role client may call this transaction. The Edge
-- Function checks the caller's Auth JWT and demo profile before invoking it.
create function public.reset_demo_data(target_demo_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = target_demo_id and role = 'demo' and is_demo
  ) then
    raise exception 'Invalid demo identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_demo_id::text, 0));
  delete from public.audit_logs where owner_id = target_demo_id;
  delete from public.buyers where owner_id = target_demo_id;
  insert into public.buyers (id, owner_id, name, phone, preferred_courier)
  values
    ('demo-seed-ada', target_demo_id, 'Ada Example', '09170000001', 'LBC'),
    ('demo-seed-beni', target_demo_id, 'Beni Example', '09170000002', 'J&T Express'),
    ('demo-seed-cora', target_demo_id, 'Cora Example', '09170000003', 'LBC');
  insert into public.addresses
    (id, buyer_id, recipient_name, recipient_phone, street, barangay, city, province, zip_code, is_default)
  values
    ('demo-address-ada', 'demo-seed-ada', 'Ada Example', '09170000001', '1 Sample Street', 'Sample Barangay', 'Quezon City', 'Metro Manila', '1100', true),
    ('demo-address-beni', 'demo-seed-beni', 'Beni Example', '09170000002', '2 Sample Street', 'Sample Barangay', 'Pasig', 'Metro Manila', '1600', true);
  insert into public.pickup_locations
    (id, buyer_id, recipient_name, recipient_phone, branch_name, branch_address, is_default)
  values
    ('demo-pickup-cora', 'demo-seed-cora', 'Cora Example', '09170000003', 'Sample LBC Branch', '3 Sample Avenue, Quezon City', true);
  return 3;
end;
$$;
revoke all on function public.reset_demo_data(uuid) from public, anon, authenticated;
grant execute on function public.reset_demo_data(uuid) to service_role;

-- Durable per-client bucket for the public one-click endpoint. The Edge
-- Function supplies a salted hash; raw IP addresses are not stored here.
create table private.demo_login_limits (
  fingerprint text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
revoke all on private.demo_login_limits from public, anon, authenticated;
create function public.claim_demo_login_slot(client_fingerprint text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare allowed boolean;
begin
  if client_fingerprint is null or length(client_fingerprint) <> 64 then
    return false;
  end if;
  insert into private.demo_login_limits (fingerprint, window_start, attempts)
  values (client_fingerprint, now(), 1)
  on conflict (fingerprint) do update
    set window_start = case
      when private.demo_login_limits.window_start < now() - interval '5 minutes'
      then now() else private.demo_login_limits.window_start end,
      attempts = case
        when private.demo_login_limits.window_start < now() - interval '5 minutes'
        then 1 else private.demo_login_limits.attempts + 1 end
  returning attempts <= 10 into allowed;
  return allowed;
end;
$$;
revoke all on function public.claim_demo_login_slot(text) from public, anon, authenticated;
grant execute on function public.claim_demo_login_slot(text) to service_role;
