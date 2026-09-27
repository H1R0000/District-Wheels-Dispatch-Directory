create or replace function public.confirm_buyer_deletion(confirmation_code text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  pending record;
  buyer record;
  saved_addresses jsonb;
  saved_pickups jsonb;
  destination jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_allowed_user()) then
    raise exception 'Account not approved';
  end if;
  select * into pending from private.pending_buyer_deletions
    where user_id = (select auth.uid()) for update;
  if not found or pending.expires_at <= now() or pending.code <> upper(confirmation_code) then
    raise exception 'Confirmation expired or invalid';
  end if;
  select * into buyer from public.buyers
    where id = pending.buyer_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Buyer not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.is_default desc, a.id), '[]'::jsonb)
    into saved_addresses from public.addresses a where a.buyer_id = buyer.id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.is_default desc, p.id), '[]'::jsonb)
    into saved_pickups from public.pickup_locations p where p.buyer_id = buyer.id;
  destination := case when buyer.preferred_courier = 'LBC'
      and jsonb_array_length(saved_addresses) = 0 and jsonb_array_length(saved_pickups) > 0
    then saved_pickups->0 else saved_addresses->0 end;
  delete from public.buyers where id = buyer.id and owner_id = (select auth.uid());
  insert into public.audit_logs (owner_id, buyer_id, action, source, before_data)
    values ((select auth.uid()), buyer.id, 'delete', 'chatbot',
      to_jsonb(buyer) || jsonb_build_object('addresses', saved_addresses, 'pickup_locations', saved_pickups));
  delete from private.pending_buyer_deletions where user_id = (select auth.uid());
  return jsonb_build_object('name', buyer.name, 'phone', buyer.phone,
    'courier', buyer.preferred_courier, 'destination', destination);
end;
$$;
