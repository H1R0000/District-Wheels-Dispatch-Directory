create table public.buyers (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text not null check (phone ~ '^[0-9]{7,15}$'),
  preferred_courier text not null check (preferred_courier in ('LBC', 'J&T Express')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, phone)
);

create table public.addresses (
  id text primary key,
  buyer_id text not null references public.buyers(id) on delete cascade,
  recipient_name text not null,
  recipient_phone text not null check (recipient_phone ~ '^[0-9]{7,15}$'),
  street text not null,
  barangay text not null,
  city text not null,
  province text not null,
  zip_code text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.pickup_locations (
  id text primary key,
  buyer_id text not null references public.buyers(id) on delete cascade,
  recipient_name text not null,
  recipient_phone text not null check (recipient_phone ~ '^[0-9]{7,15}$'),
  branch_name text not null,
  branch_address text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  buyer_id text,
  action text not null check (action in ('create', 'update', 'delete', 'chat_lookup')),
  source text not null default 'app' check (source in ('app', 'chatbot', 'migration')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.postal_codes (
  id bigint generated always as identity primary key,
  country_code text not null default 'PH' check (country_code = 'PH'),
  postal_code text not null,
  locality text not null,
  province text not null,
  source text not null,
  unique (postal_code, locality, province)
);

create unique index one_default_address_per_buyer
  on public.addresses (buyer_id) where is_default;
create unique index one_default_pickup_per_buyer
  on public.pickup_locations (buyer_id) where is_default;
create index buyers_owner_name on public.buyers (owner_id, lower(name));
create index addresses_buyer_id on public.addresses (buyer_id);
create index pickup_locations_buyer_id on public.pickup_locations (buyer_id);
create index audit_logs_owner_created_at on public.audit_logs (owner_id, created_at desc);
create index postal_codes_lookup on public.postal_codes (postal_code, lower(locality));

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger buyers_set_updated_at
before update on public.buyers
for each row execute function public.set_updated_at();

alter table public.buyers enable row level security;
alter table public.addresses enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.postal_codes enable row level security;

revoke all on table public.buyers from anon, authenticated;
revoke all on table public.addresses from anon, authenticated;
revoke all on table public.pickup_locations from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.postal_codes from anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

grant select, insert, update, delete on table public.buyers to authenticated;
grant select, insert, update, delete on table public.addresses to authenticated;
grant select, insert, update, delete on table public.pickup_locations to authenticated;
grant select, insert on table public.audit_logs to authenticated;
grant select on table public.postal_codes to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;
grant usage, select on sequence public.postal_codes_id_seq to authenticated;

create policy buyers_select_own on public.buyers
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy buyers_insert_own on public.buyers
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy buyers_update_own on public.buyers
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy buyers_delete_own on public.buyers
for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy addresses_select_own_buyer on public.addresses
for select to authenticated
using (exists (
  select 1 from public.buyers
  where buyers.id = addresses.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy addresses_insert_own_buyer on public.addresses
for insert to authenticated
with check (exists (
  select 1 from public.buyers
  where buyers.id = addresses.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy addresses_update_own_buyer on public.addresses
for update to authenticated
using (exists (
  select 1 from public.buyers
  where buyers.id = addresses.buyer_id
    and buyers.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.buyers
  where buyers.id = addresses.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy addresses_delete_own_buyer on public.addresses
for delete to authenticated
using (exists (
  select 1 from public.buyers
  where buyers.id = addresses.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy pickups_select_own_buyer on public.pickup_locations
for select to authenticated
using (exists (
  select 1 from public.buyers
  where buyers.id = pickup_locations.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy pickups_insert_own_buyer on public.pickup_locations
for insert to authenticated
with check (exists (
  select 1 from public.buyers
  where buyers.id = pickup_locations.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy pickups_update_own_buyer on public.pickup_locations
for update to authenticated
using (exists (
  select 1 from public.buyers
  where buyers.id = pickup_locations.buyer_id
    and buyers.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.buyers
  where buyers.id = pickup_locations.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy pickups_delete_own_buyer on public.pickup_locations
for delete to authenticated
using (exists (
  select 1 from public.buyers
  where buyers.id = pickup_locations.buyer_id
    and buyers.owner_id = (select auth.uid())
));

create policy audit_logs_select_own on public.audit_logs
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy audit_logs_insert_own on public.audit_logs
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy postal_codes_authenticated_read on public.postal_codes
for select to authenticated
using ((select auth.uid()) is not null);
