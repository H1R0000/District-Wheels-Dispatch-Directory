-- Keep deletion and its audit record in one database transaction.
create function public.delete_buyer(target_buyer_id text)
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
    raise exception 'Account not approved';
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
