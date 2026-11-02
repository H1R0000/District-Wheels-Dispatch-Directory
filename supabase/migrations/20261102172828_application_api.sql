create function public.application_access()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('allowed', (select private.is_allowed_user()),
    'role', (select role from public.profiles where id = (select auth.uid())));
$$;
revoke all on function public.application_access() from public, anon;
grant execute on function public.application_access() to authenticated;

create table private.api_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 120)
);
alter table private.api_request_limits enable row level security;
revoke all on private.api_request_limits from public, anon, authenticated;
create function private.claim_api_request_slot()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid()); request_time timestamptz := clock_timestamp(); slot private.api_request_limits%rowtype;
begin
  if caller is null or not (select private.is_allowed_user()) then
    return jsonb_build_object('authorized', false);
  end if;
  insert into private.api_request_limits as limits (user_id, window_start, attempts)
    values (caller, request_time, 1)
    on conflict (user_id) do update set
      window_start = case when limits.window_start <= request_time - interval '1 minute' then request_time else limits.window_start end,
      attempts = case when limits.window_start <= request_time - interval '1 minute' then 1 else limits.attempts + 1 end
    where limits.window_start <= request_time - interval '1 minute' or limits.attempts < 120
    returning * into slot;
  if not found then
    select * into slot from private.api_request_limits where user_id = caller;
    return jsonb_build_object('authorized', true, 'allowed', false, 'remaining', 0,
      'retry_after', greatest(1, ceil(extract(epoch from slot.window_start + interval '1 minute' - request_time))::integer));
  end if;
  return jsonb_build_object('authorized', true, 'allowed', true, 'remaining', 120 - slot.attempts,
    'retry_after', greatest(1, ceil(extract(epoch from slot.window_start + interval '1 minute' - request_time))::integer));
end;
$$;
revoke all on function private.claim_api_request_slot() from public, anon;
grant execute on function private.claim_api_request_slot() to authenticated;
create function public.claim_api_request_slot()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.claim_api_request_slot(); $$;
revoke all on function public.claim_api_request_slot() from public, anon;
grant execute on function public.claim_api_request_slot() to authenticated;

-- Preserve existing transaction/RLS behavior; expose stable error codes.
-- A single RPC replaces the browser's multi-request save sequence. PostgreSQL
-- rolls the whole function call back if any child row or audit insert fails.
create or replace function public.save_buyer(payload jsonb, create_new boolean)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  target_buyer_id text := payload->>'id';
  buyer_name text := trim(coalesce(payload->>'name', ''));
  buyer_phone text := coalesce(payload->>'phone', '');
  courier text := payload->>'preferredCourier';
  address_item jsonb;
  pickup_item jsonb;
  before_row jsonb;
  address_defaults integer := 0;
  pickup_defaults integer := 0;
begin
  if user_id is null or not (select private.is_allowed_user()) then
    raise exception using errcode = 'PT403', message = 'Account not approved';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
    or create_new is null
    or target_buyer_id is null or length(target_buyer_id) not between 1 and 120
    or length(buyer_name) not between 1 and 120
    or buyer_phone !~ '^[0-9]{7,15}$'
    or courier not in ('LBC', 'J&T Express')
    or jsonb_typeof(payload->'addresses') is distinct from 'array'
    or jsonb_typeof(payload->'pickups') is distinct from 'array'
    or jsonb_array_length(payload->'addresses') > 30
    or jsonb_array_length(payload->'pickups') > 30 then
    raise exception using errcode = 'PT400', message = 'Invalid buyer details';
  end if;
  if jsonb_array_length(payload->'addresses') + jsonb_array_length(payload->'pickups') = 0
    or (courier = 'J&T Express' and jsonb_array_length(payload->'addresses') = 0) then
    raise exception using errcode = 'PT400', message = 'A delivery location is required';
  end if;

  if create_new then
    insert into public.buyers (id, owner_id, name, phone, preferred_courier)
      values (target_buyer_id, user_id, buyer_name, buyer_phone, courier);
  else
    select to_jsonb(b) into before_row from public.buyers b
      where b.id = target_buyer_id and b.owner_id = user_id for update;
    if not found then raise exception using errcode = 'PT404', message = 'Buyer not found'; end if;
    update public.buyers set name = buyer_name, phone = buyer_phone,
      preferred_courier = courier where id = target_buyer_id and owner_id = user_id;
    delete from public.addresses where buyer_id = target_buyer_id;
    delete from public.pickup_locations where buyer_id = target_buyer_id;
  end if;

  for address_item in select value from jsonb_array_elements(payload->'addresses') loop
    if jsonb_typeof(address_item) <> 'object'
      or length(trim(coalesce(address_item->>'street', ''))) = 0
      or length(trim(coalesce(address_item->>'barangay', ''))) = 0
      or length(trim(coalesce(address_item->>'city', ''))) = 0
      or length(trim(coalesce(address_item->>'province', ''))) = 0
      or length(trim(coalesce(address_item->>'zipCode', ''))) = 0
      or jsonb_typeof(address_item->'isDefault') <> 'boolean' then
      raise exception using errcode = 'PT400', message = 'Invalid delivery address';
    end if;
    address_defaults := address_defaults + (address_item->>'isDefault')::boolean::integer;
    insert into public.addresses (id, buyer_id, recipient_name, recipient_phone,
      street, barangay, city, province, zip_code, is_default)
    values (coalesce(nullif(address_item->>'id', ''), 'address-' || gen_random_uuid()::text),
      target_buyer_id, buyer_name, buyer_phone, trim(address_item->>'street'),
      trim(address_item->>'barangay'), trim(address_item->>'city'),
      trim(address_item->>'province'), trim(address_item->>'zipCode'),
      (address_item->>'isDefault')::boolean);
  end loop;

  for pickup_item in select value from jsonb_array_elements(payload->'pickups') loop
    if jsonb_typeof(pickup_item) <> 'object'
      or length(trim(coalesce(pickup_item->>'branchName', ''))) = 0
      or length(trim(coalesce(pickup_item->>'branchAddress', ''))) = 0
      or jsonb_typeof(pickup_item->'isDefault') <> 'boolean' then
      raise exception using errcode = 'PT400', message = 'Invalid pickup location';
    end if;
    pickup_defaults := pickup_defaults + (pickup_item->>'isDefault')::boolean::integer;
    insert into public.pickup_locations (id, buyer_id, recipient_name, recipient_phone,
      branch_name, branch_address, is_default)
    values (coalesce(nullif(pickup_item->>'id', ''), 'pickup-' || gen_random_uuid()::text),
      target_buyer_id, buyer_name, buyer_phone, trim(pickup_item->>'branchName'),
      trim(pickup_item->>'branchAddress'), (pickup_item->>'isDefault')::boolean);
  end loop;

  if (jsonb_array_length(payload->'addresses') > 0 and address_defaults <> 1)
    or (jsonb_array_length(payload->'pickups') > 0 and pickup_defaults <> 1) then
    raise exception using errcode = 'PT400', message = 'Choose exactly one default for each location type';
  end if;
  insert into public.audit_logs (owner_id, buyer_id, action, source, before_data, after_data)
    values (user_id, target_buyer_id, case when create_new then 'create' else 'update' end,
      'app', before_row, payload);
  return target_buyer_id;
end;
$$;

revoke all on function public.save_buyer(jsonb, boolean) from public, anon;
grant execute on function public.save_buyer(jsonb, boolean) to authenticated;

-- Preserve existing transaction/RLS behavior; expose stable error codes.
-- Keep deletion and its audit record in one database transaction.
create or replace function public.delete_buyer(target_buyer_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  user_id uuid := (select auth.uid());
  before_row jsonb;
  saved_addresses jsonb;
  saved_pickups jsonb;
begin
  if user_id is null or not (select private.is_allowed_user()) then
    raise exception using errcode = 'PT403', message = 'Account not approved';
  end if;
  select to_jsonb(b) into before_row from public.buyers b
    where b.id = target_buyer_id and b.owner_id = user_id for update;
  if not found then return false; end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)
    into saved_addresses from public.addresses a where a.buyer_id = target_buyer_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
    into saved_pickups from public.pickup_locations p where p.buyer_id = target_buyer_id;
  before_row := before_row || jsonb_build_object(
    'addresses', saved_addresses, 'pickup_locations', saved_pickups);
  delete from public.buyers where id = target_buyer_id and owner_id = user_id;
  insert into public.audit_logs (owner_id, buyer_id, action, source, before_data)
    values (user_id, target_buyer_id, 'delete', 'app', before_row);
  return true;
end;
$$;

revoke all on function public.delete_buyer(text) from public, anon;
grant execute on function public.delete_buyer(text) to authenticated;

-- Preserve existing transaction/RLS behavior; expose stable error codes.
create or replace function public.restore_owner_backup(payload jsonb, dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare item jsonb; child jsonb; owner_uuid uuid := (select auth.uid());
  missing_count integer := 0; inserted_count integer := 0; item_id text;
begin
  if owner_uuid is null or not (select private.is_allowed_user()) or not exists (
    select 1 from public.profiles where id = owner_uuid and role = 'owner' and not is_demo
  ) then raise exception using errcode = 'PT403', message = 'Owner access required'; end if;
  if payload->>'format' is distinct from 'district-wheels-owner-backup-v1'
    or payload->>'owner_id' is distinct from owner_uuid::text
    or jsonb_typeof(payload->'buyers') is distinct from 'array'
    or jsonb_array_length(payload->'buyers') > 1000
    or octet_length(payload::text) > 2000000 then
    raise exception using errcode = 'PT400', message = 'Invalid backup file';
  end if;
  for item in select value from jsonb_array_elements(payload->'buyers') loop
    item_id := item->>'id';
    if item_id is null or length(item_id) > 120
      or item->>'owner_id' is distinct from owner_uuid::text
      or length(trim(coalesce(item->>'name', ''))) not between 1 and 120
      or coalesce(item->>'phone', '') !~ '^[0-9]{7,15}$'
      or item->>'preferred_courier' not in ('LBC', 'J&T Express')
      or jsonb_typeof(item->'addresses') is distinct from 'array'
      or jsonb_typeof(item->'pickup_locations') is distinct from 'array'
      or jsonb_array_length(item->'addresses') > 30
      or jsonb_array_length(item->'pickup_locations') > 30 then
      raise exception using errcode = 'PT400', message = 'Invalid buyer in backup';
    end if;
    for child in select value from jsonb_array_elements(item->'addresses') loop
      if nullif(child->>'id', '') is null or length(child->>'id') > 120
        or nullif(child->>'recipient_name', '') is null
        or coalesce(child->>'recipient_phone', '') !~ '^[0-9]{7,15}$'
        or nullif(child->>'street', '') is null
        or nullif(child->>'barangay', '') is null
        or nullif(child->>'city', '') is null
        or nullif(child->>'province', '') is null
        or nullif(child->>'zip_code', '') is null
        or child->>'is_default' not in ('true', 'false') then
        raise exception using errcode = 'PT400', message = 'Invalid address in backup';
      end if;
    end loop;
    for child in select value from jsonb_array_elements(item->'pickup_locations') loop
      if nullif(child->>'id', '') is null or length(child->>'id') > 120
        or nullif(child->>'recipient_name', '') is null
        or coalesce(child->>'recipient_phone', '') !~ '^[0-9]{7,15}$'
        or nullif(child->>'branch_name', '') is null
        or nullif(child->>'branch_address', '') is null
        or child->>'is_default' not in ('true', 'false') then
        raise exception using errcode = 'PT400', message = 'Invalid pickup location in backup';
      end if;
    end loop;
    if exists (select 1 from public.buyers where id = item_id) then
      if not exists (select 1 from public.buyers where id = item_id and owner_id = owner_uuid) then
        raise exception using errcode = 'PT400', message = 'Backup conflicts with another account';
      end if;
      continue;
    end if;
    missing_count := missing_count + 1;
    if coalesce(dry_run, true) then continue; end if;
    insert into public.buyers (id, owner_id, name, phone, preferred_courier)
      values (item_id, owner_uuid, item->>'name', item->>'phone', item->>'preferred_courier');
    for child in select value from jsonb_array_elements(item->'addresses') loop
      insert into public.addresses (id, buyer_id, recipient_name, recipient_phone,
        street, barangay, city, province, zip_code, is_default)
      values (child->>'id', item_id, child->>'recipient_name', child->>'recipient_phone',
        child->>'street', child->>'barangay', child->>'city', child->>'province',
        child->>'zip_code', coalesce((child->>'is_default')::boolean, false));
    end loop;
    for child in select value from jsonb_array_elements(item->'pickup_locations') loop
      insert into public.pickup_locations (id, buyer_id, recipient_name, recipient_phone,
        branch_name, branch_address, is_default)
      values (child->>'id', item_id, child->>'recipient_name', child->>'recipient_phone',
        child->>'branch_name', child->>'branch_address',
        coalesce((child->>'is_default')::boolean, false));
    end loop;
    insert into public.audit_logs (owner_id, buyer_id, action, source, after_data)
      values (owner_uuid, item_id, 'create', 'migration', item);
    inserted_count := inserted_count + 1;
  end loop;
  return jsonb_build_object('backup_buyers', jsonb_array_length(payload->'buyers'),
    'missing_buyers', missing_count, 'restored_buyers', inserted_count);
end;
$$;
revoke all on function public.restore_owner_backup(jsonb, boolean) from public, anon;
grant execute on function public.restore_owner_backup(jsonb, boolean) to authenticated;

