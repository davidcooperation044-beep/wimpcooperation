-- Wimpy Portal schema and row-level security for portal_users and supporting tables.

create table if not exists portal_users (
  id uuid primary key,
  email text not null unique,
  role text not null check (role in ('admin', 'worker', 'affiliate')),
  status text not null default 'active' check (status in ('active', 'deactivated')),
  created_by uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists worker_tasks (
  id uuid primary key default gen_random_uuid(),
  assigned_to uuid not null references portal_users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'complete')),
  due_date date,
  project_ref text,
  created_at timestamp with time zone not null default now()
);

create table if not exists affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references portal_users(id) on delete cascade,
  code text not null unique,
  clicks integer not null default 0,
  conversions integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references portal_users(id) on delete cascade,
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  payout_date date,
  created_at timestamp with time zone not null default now()
);

create or replace function is_admin() returns boolean stable language sql as $$
  select exists (
    select 1 from portal_users
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function is_worker() returns boolean stable language sql as $$
  select exists (
    select 1 from portal_users
    where id = auth.uid() and role = 'worker' and status = 'active'
  );
$$;

create or replace function is_affiliate() returns boolean stable language sql as $$
  select exists (
    select 1 from portal_users
    where id = auth.uid() and role = 'affiliate' and status = 'active'
  );
$$;

alter table portal_users enable row level security;
create policy "portal admins manage users" on portal_users
  using (is_admin())
  with check (is_admin());

create policy "users may read own profile" on portal_users
  for select using (auth.uid() = id and status = 'active');

create policy "users may update own profile" on portal_users
  for update using (auth.uid() = id and status = 'active') with check (auth.uid() = id);

alter table worker_tasks enable row level security;
create policy "admin may manage tasks" on worker_tasks
  using (is_admin())
  with check (is_admin());

create policy "worker may manage own tasks" on worker_tasks
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

alter table affiliate_referrals enable row level security;
create policy "admin may manage referrals" on affiliate_referrals
  using (is_admin())
  with check (is_admin());

create policy "affiliate may read own referrals" on affiliate_referrals
  for select using (affiliate_id = auth.uid());

alter table affiliate_commissions enable row level security;
create policy "admin may manage commissions" on affiliate_commissions
  using (is_admin())
  with check (is_admin());

create policy "affiliate may read own commissions" on affiliate_commissions
  for select using (affiliate_id = auth.uid());
