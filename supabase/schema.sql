-- Church volunteer app: database schema and access rules.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run: every object is created only if missing, and policies are replaced.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per login. Role decides what the person can do.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  role text not null default 'volunteer' check (role in ('volunteer', 'coordinator', 'admin')),
  created_at timestamptz not null default now()
);

-- Areas of interest (the checkboxes on the Power of Yes card). Admins can add more later.
create table if not exists public.ministries (
  id text primary key,
  label text not null,
  kind text not null default 'ministry' check (kind in ('ministry', 'event')),
  hint text not null default '',
  sort int not null default 100,
  active boolean not null default true
);

-- A volunteer. user_id is set when the person has their own login;
-- it stays null for paper cards that office staff type in.
create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  phone text not null default '',
  email text not null default '',
  ministries text[] not null default '{}',
  contacted boolean not null default false,
  source text not null default 'online' check (source in ('online', 'card')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists volunteers_email_idx on public.volunteers (lower(email));

-- Staff-only notes about a volunteer, kept apart so volunteers can never read them.
create table if not exists public.volunteer_notes (
  volunteer_id uuid primary key references public.volunteers (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- An event or project volunteers can be assigned to.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  date date,
  time text not null default '',
  place text not null default '',
  area text references public.ministries (id) on delete set null,
  needed int check (needed is null or needed >= 0),
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who is assigned to what, and whether they showed up.
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  volunteer_id uuid not null references public.volunteers (id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'attended', 'missed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, volunteer_id)
);
create index if not exists assignments_volunteer_idx on public.assignments (volunteer_id);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can read profiles without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('coordinator', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.my_volunteer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.volunteers where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create a profile for every new login. The very first account becomes the admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case when exists (select 1 from public.profiles) then 'volunteer' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists volunteers_touch on public.volunteers;
create trigger volunteers_touch before update on public.volunteers
  for each row execute function public.touch_updated_at();
drop trigger if exists volunteer_notes_touch on public.volunteer_notes;
create trigger volunteer_notes_touch before update on public.volunteer_notes
  for each row execute function public.touch_updated_at();
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
drop trigger if exists assignments_touch on public.assignments;
create trigger assignments_touch before update on public.assignments
  for each row execute function public.touch_updated_at();

-- Volunteers editing their own record cannot change staff-only fields.
create or replace function public.guard_volunteer_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.contacted := false;
    new.source := 'online';
  else
    -- Allow linking an unclaimed paper card to the login with the same email.
    if not (old.user_id is null and new.user_id = auth.uid()
            and lower(old.email) = lower((select email from auth.users where id = auth.uid()))) then
      new.user_id := old.user_id;
    end if;
    new.contacted := old.contacted;
    new.source := old.source;
  end if;
  return new;
end;
$$;

drop trigger if exists volunteers_guard on public.volunteers;
create trigger volunteers_guard before insert or update on public.volunteers
  for each row execute function public.guard_volunteer_fields();

-- Profiles: nobody but an admin may change a role, and an admin cannot demote the last admin.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only an admin can change roles';
    end if;
    if old.role = 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'There must always be at least one admin';
    end if;
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Link a new login to a paper card that staff already typed in with the same email.
-- The app calls this right after someone signs in.
-- ---------------------------------------------------------------------------
create or replace function public.claim_my_volunteer_record() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  my_email text := (select email from auth.users where id = auth.uid());
  found_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  select id into found_id from public.volunteers where user_id = auth.uid();
  if found_id is not null then
    return found_id;
  end if;
  if coalesce(my_email, '') = '' then
    return null;
  end if;
  update public.volunteers
     set user_id = auth.uid()
   where id = (
     select id from public.volunteers
      where user_id is null and lower(email) = lower(my_email)
      order by created_at
      limit 1)
  returning id into found_id;
  return found_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.ministries enable row level security;
alter table public.volunteers enable row level security;
alter table public.volunteer_notes enable row level security;
alter table public.events enable row level security;
alter table public.assignments enable row level security;

-- profiles
drop policy if exists "profiles: read own or staff" on public.profiles;
create policy "profiles: read own or staff" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ministries
drop policy if exists "ministries: everyone signed in reads" on public.ministries;
create policy "ministries: everyone signed in reads" on public.ministries
  for select to authenticated using (true);
drop policy if exists "ministries: admin writes" on public.ministries;
create policy "ministries: admin writes" on public.ministries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- volunteers
drop policy if exists "volunteers: read own or staff" on public.volunteers;
create policy "volunteers: read own or staff" on public.volunteers
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists "volunteers: create own or staff" on public.volunteers;
create policy "volunteers: create own or staff" on public.volunteers
  for insert to authenticated with check (
    public.is_staff()
    or (public.my_volunteer_id() is null and user_id = auth.uid())
  );
drop policy if exists "volunteers: update own or staff" on public.volunteers;
create policy "volunteers: update own or staff" on public.volunteers
  for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());
drop policy if exists "volunteers: staff deletes" on public.volunteers;
create policy "volunteers: staff deletes" on public.volunteers
  for delete to authenticated using (public.is_staff());

-- volunteer_notes: staff only
drop policy if exists "volunteer_notes: staff only" on public.volunteer_notes;
create policy "volunteer_notes: staff only" on public.volunteer_notes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- events: staff see all; a volunteer sees the events they are assigned to
drop policy if exists "events: staff or assigned reads" on public.events;
create policy "events: staff or assigned reads" on public.events
  for select to authenticated using (
    public.is_staff()
    or exists (
      select 1 from public.assignments a
       where a.event_id = events.id and a.volunteer_id = public.my_volunteer_id())
  );
drop policy if exists "events: staff writes" on public.events;
create policy "events: staff writes" on public.events
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- assignments: staff manage; a volunteer reads their own
drop policy if exists "assignments: staff or own reads" on public.assignments;
create policy "assignments: staff or own reads" on public.assignments
  for select to authenticated using (
    public.is_staff() or volunteer_id = public.my_volunteer_id()
  );
drop policy if exists "assignments: staff writes" on public.assignments;
create policy "assignments: staff writes" on public.assignments
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.claim_my_volunteer_record() to authenticated;

-- ---------------------------------------------------------------------------
-- Areas of interest from the paper card
-- ---------------------------------------------------------------------------
insert into public.ministries (id, label, kind, hint, sort) values
  ('childrens-liturgy', 'Children''s Liturgy', 'ministry', 'Once a month', 10),
  ('hallow-helper', 'Hallow Helper', 'ministry', '5–10 min after Mass', 20),
  ('parish-leadership', 'Parish Leadership', 'ministry', '', 30),
  ('greeter-usher', 'Mass Greeter / Usher', 'ministry', '', 40),
  ('parish-security', 'Parish Security', 'ministry', '', 50),
  ('lawn-games', 'Outdoor Lawn Game Organizer', 'event', '', 60),
  ('craft-flea', 'Craft Shows & Flea Market', 'event', '', 70),
  ('pierogies', 'Pierogies', 'event', '', 80),
  ('movie-night', 'Movie Night', 'event', '', 90),
  ('potluck', 'International Pot Luck', 'event', '', 100),
  ('pancake', 'All-You-Can-Eat Pancake Breakfast', 'event', '', 110)
on conflict (id) do nothing;
