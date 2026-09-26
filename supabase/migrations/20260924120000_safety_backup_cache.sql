-- Confirmation is issued by the database for one buyer and expires quickly.
create table private.pending_buyer_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  buyer_id text not null,
  code text not null,
  expires_at timestamptz not null
);
revoke all on private.pending_buyer_deletions from public, anon, authenticated;

create function public.prepare_buyer_deletion(target_buyer_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare buyer record; confirmation_code text;
begin
  if (select auth.uid()) is null or not (select private.is_allowed_user()) then
    raise exception 'Account not approved';
  end if;
  select id, name, phone, preferred_courier into buyer
    from public.buyers where id = target_buyer_id and owner_id = (select auth.uid());
  if not found then raise exception 'Buyer not found'; end if;
  confirmation_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into private.pending_buyer_deletions (user_id, buyer_id, code, expires_at)
    values ((select auth.uid()), buyer.id, confirmation_code, now() + interval '5 minutes')
    on conflict (user_id) do update set buyer_id = excluded.buyer_id,
      code = excluded.code, expires_at = excluded.expires_at;
  return jsonb_build_object('name', buyer.name, 'phone', buyer.phone,
    'courier', buyer.preferred_courier, 'code', confirmation_code);
end;
$$;

create function public.confirm_buyer_deletion(confirmation_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare pending record; buyer record;
begin
  if (select auth.uid()) is null or not (select private.is_allowed_user()) then
    raise exception 'Account not approved';
  end if;
  select * into pending from private.pending_buyer_deletions
    where user_id = (select auth.uid()) for update;
  if not found or pending.expires_at <= now() or pending.code <> upper(confirmation_code) then
    raise exception 'Confirmation expired or invalid';
  end if;
  select id, name, phone, preferred_courier into buyer from public.buyers
    where id = pending.buyer_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Buyer not found'; end if;
  delete from public.buyers where id = buyer.id and owner_id = (select auth.uid());
  insert into public.audit_logs (owner_id, buyer_id, action, source, before_data)
    values ((select auth.uid()), buyer.id, 'delete', 'chatbot', to_jsonb(buyer));
  delete from private.pending_buyer_deletions where user_id = (select auth.uid());
  return jsonb_build_object('name', buyer.name, 'phone', buyer.phone);
end;
$$;
revoke all on function public.prepare_buyer_deletion(text) from public, anon;
revoke all on function public.confirm_buyer_deletion(text) from public, anon;
grant execute on function public.prepare_buyer_deletion(text) to authenticated;
grant execute on function public.confirm_buyer_deletion(text) to authenticated;

-- Owner backup restore is additive and atomic. Existing records are never overwritten.
create function public.restore_owner_backup(payload jsonb, dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare item jsonb; child jsonb; owner_uuid uuid := (select auth.uid());
  missing_count integer := 0; inserted_count integer := 0; item_id text;
begin
  if owner_uuid is null or not (select private.is_allowed_user()) or not exists (
    select 1 from public.profiles where id = owner_uuid and role = 'owner' and not is_demo
  ) then raise exception 'Owner access required'; end if;
  if payload->>'format' <> 'district-wheels-owner-backup-v1'
    or payload->>'owner_id' <> owner_uuid::text
    or jsonb_typeof(payload->'buyers') <> 'array'
    or jsonb_array_length(payload->'buyers') > 1000
    or octet_length(payload::text) > 2000000 then
    raise exception 'Invalid backup file';
  end if;
  for item in select value from jsonb_array_elements(payload->'buyers') loop
    item_id := item->>'id';
    if item_id is null or length(item_id) > 120
      or item->>'owner_id' <> owner_uuid::text
      or length(trim(coalesce(item->>'name', ''))) not between 1 and 120
      or coalesce(item->>'phone', '') !~ '^[0-9]{7,15}$'
      or item->>'preferred_courier' not in ('LBC', 'J&T Express')
      or jsonb_typeof(item->'addresses') is distinct from 'array'
      or jsonb_typeof(item->'pickup_locations') is distinct from 'array'
      or jsonb_array_length(item->'addresses') > 30
      or jsonb_array_length(item->'pickup_locations') > 30 then
      raise exception 'Invalid buyer in backup';
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
        raise exception 'Invalid address in backup';
      end if;
    end loop;
    for child in select value from jsonb_array_elements(item->'pickup_locations') loop
      if nullif(child->>'id', '') is null or length(child->>'id') > 120
        or nullif(child->>'recipient_name', '') is null
        or coalesce(child->>'recipient_phone', '') !~ '^[0-9]{7,15}$'
        or nullif(child->>'branch_name', '') is null
        or nullif(child->>'branch_address', '') is null
        or child->>'is_default' not in ('true', 'false') then
        raise exception 'Invalid pickup location in backup';
      end if;
    end loop;
    if exists (select 1 from public.buyers where id = item_id) then
      if not exists (select 1 from public.buyers where id = item_id and owner_id = owner_uuid) then
        raise exception 'Backup conflicts with another account';
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

-- One canonical copy per official name/address pair, refreshed only by the server.
create unique index lbc_branches_name_address_unique
  on public.lbc_branches (branch_name, branch_address);
