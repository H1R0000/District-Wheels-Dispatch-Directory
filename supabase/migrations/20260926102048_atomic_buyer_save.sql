-- A single RPC replaces the browser's multi-request save sequence. PostgreSQL
-- rolls the whole function call back if any child row or audit insert fails.
create function public.save_buyer(payload jsonb, create_new boolean)
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
    raise exception 'Account not approved';
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
    raise exception 'Invalid buyer details';
  end if;
  if jsonb_array_length(payload->'addresses') + jsonb_array_length(payload->'pickups') = 0
    or (courier = 'J&T Express' and jsonb_array_length(payload->'addresses') = 0) then
    raise exception 'A delivery location is required';
  end if;

  if create_new then
    insert into public.buyers (id, owner_id, name, phone, preferred_courier)
      values (target_buyer_id, user_id, buyer_name, buyer_phone, courier);
  else
    select to_jsonb(b) into before_row from public.buyers b
      where b.id = target_buyer_id and b.owner_id = user_id for update;
    if not found then raise exception 'Buyer not found'; end if;
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
      raise exception 'Invalid delivery address';
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
      raise exception 'Invalid pickup location';
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
    raise exception 'Choose exactly one default for each location type';
  end if;
  insert into public.audit_logs (owner_id, buyer_id, action, source, before_data, after_data)
    values (user_id, target_buyer_id, case when create_new then 'create' else 'update' end,
      'app', before_row, payload);
  return target_buyer_id;
end;
$$;

revoke all on function public.save_buyer(jsonb, boolean) from public, anon;
grant execute on function public.save_buyer(jsonb, boolean) to authenticated;
