-- A shared quota survives Edge worker restarts and cannot be bypassed by
-- opening another session. Use the same allowlist as buyer RLS, including OAuth.
create table private.assistant_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 20)
);
alter table private.assistant_request_limits enable row level security;
revoke all on private.assistant_request_limits from public, anon, authenticated;

create function public.claim_assistant_request_slot()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  request_time timestamptz := clock_timestamp();
  slot private.assistant_request_limits%rowtype;
begin
  if caller is null or not (select private.is_allowed_user()) then
    return jsonb_build_object('authorized', false);
  end if;
  insert into private.assistant_request_limits as limits (user_id, window_start, attempts)
    values (caller, request_time, 1)
    on conflict (user_id) do update set
      window_start = case when limits.window_start <= request_time - interval '1 minute' then request_time else limits.window_start end,
      attempts = case when limits.window_start <= request_time - interval '1 minute' then 1 else limits.attempts + 1 end
    where limits.window_start <= request_time - interval '1 minute' or limits.attempts < 20
    returning * into slot;
  if not found then
    select * into slot from private.assistant_request_limits where user_id = caller;
    return jsonb_build_object('authorized', true, 'allowed', false, 'remaining', 0,
      'retry_after', greatest(1, ceil(extract(epoch from slot.window_start + interval '1 minute' - request_time))::integer));
  end if;
  return jsonb_build_object('authorized', true, 'allowed', true, 'remaining', 20 - slot.attempts,
    'retry_after', greatest(1, ceil(extract(epoch from slot.window_start + interval '1 minute' - request_time))::integer));
end;
$$;
revoke all on function public.claim_assistant_request_slot() from public, anon;
grant execute on function public.claim_assistant_request_slot() to authenticated;
