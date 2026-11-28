-- ============================================================================
-- Atlas Clothier - 0011: customer profile backfill (OPTIONAL, NOT APPLIED)
--
-- Why: clearing public.customers while Supabase Auth users remain leaves those
-- accounts without a customer row. The application now recreates the row
-- lazily on the first account request, so this script is NOT required. It is an
-- optional one-off repair that avoids relying on each user visiting the site.
--
-- Safety: no deletes, no truncates, no RLS changes. Rows are only linked or
-- inserted, and auth_uid is guarded by the existing UNIQUE constraint.
-- Review, test on staging, then run manually in the Supabase SQL Editor.
-- ============================================================================

begin;

-- 1. Link one unlinked customer row per Auth user by email. Older guest
--    checkout rows may have the same email, so only the earliest row is used
--    and users that already have a row are skipped.
with matches as (
  select
    c.id as customer_id,
    u.id as auth_uid,
    row_number() over (partition by u.id order by c.created_at) as rn
  from public.customers c
  join auth.users u on lower(c.email) = lower(u.email)
  where c.auth_uid is null
    and not exists (
      select 1 from public.customers mine where mine.auth_uid = u.id
    )
)
update public.customers c
set auth_uid = m.auth_uid
from matches m
where c.id = m.customer_id
  and m.rn = 1;

-- 2. Create a customer row for every Auth user still missing one.
insert into public.customers (auth_uid, email, name)
select
  u.id,
  coalesce(u.email, ''),
  nullif(
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      ''
    ),
    ''
  )
from auth.users u
left join public.customers c on c.auth_uid = u.id
where c.id is null
on conflict (auth_uid) do nothing;

commit;

-- Verification (read-only):
-- select count(*) as auth_users from auth.users;
-- select count(*) as customers_with_auth from public.customers where auth_uid is not null;
-- select u.id, u.email from auth.users u
--   left join public.customers c on c.auth_uid = u.id
--   where c.id is null;
