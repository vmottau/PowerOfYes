-- Church volunteer app: database schema and access rules (many churches, one database).
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run: objects are created only if missing, and functions and policies are replaced.
--
-- Who can do what
--   Platform owner : the first account ever created. Adds churches and can help in any church.
--   Church admin   : runs one church: its look, its people and roles, plus everything a coordinator does.
--   Coordinator    : sees that church's volunteers, events, follow-ups and lists; records attendance.
--   Volunteer      : their own card at that church and the events they're assigned to.
-- Every row of church data carries church_id, and every rule below checks the person's role in that church.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per church, including its "skin".
create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  org_name text not null check (length(trim(org_name)) > 0),
  app_title text not null default 'The Power of Yes',
  tagline text not null default 'No amount of effort is too big or too small.',
  primary_color text not null default '#5b2a86' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text not null default '#a259c6' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  logo text not null default '' check (length(logo) < 400000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A person's role at a church. Someone can belong to several churches.
create table if not exists public.memberships (
  church_id uuid not null references public.churches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'volunteer' check (role in ('volunteer', 'coordinator', 'admin')),
  created_at timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);

-- Email invitations to a church with a role. Used when that person next signs in.
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  role text not null check (role in ('volunteer', 'coordinator', 'admin')),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (church_id, email)
);

-- Areas of interest (the checkboxes on the card), per church.
create table if not exists public.ministries (
  church_id uuid not null references public.churches (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9-]{1,60}$'),
  label text not null check (length(trim(label)) > 0),
  kind text not null default 'ministry' check (kind in ('ministry', 'event')),
  hint text not null default '',
  sort int not null default 100,
  active boolean not null default true,
  primary key (church_id, id)
);

create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  phone text not null default '',
  email text not null default '',
  ministries text[] not null default '{}',
  contacted boolean not null default false,
  source text not null default 'online' check (source in ('online', 'card')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, user_id),
  unique (id, church_id)
);
create index if not exists volunteers_church_email_idx on public.volunteers (church_id, lower(email));

-- Staff-only notes, kept apart so volunteers can never read them.
create table if not exists public.volunteer_notes (
  volunteer_id uuid primary key,
  church_id uuid not null,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  foreign key (volunteer_id, church_id) references public.volunteers (id, church_id) on delete cascade
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  date date,
  time text not null default '',
  place text not null default '',
  area text,
  needed int check (needed is null or needed >= 0),
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, church_id),
  foreign key (church_id, area) references public.ministries (church_id, id) on delete set null (area)
);
create index if not exists events_church_date_idx on public.events (church_id, date);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null,
  event_id uuid not null,
  volunteer_id uuid not null,
  status text not null default 'assigned' check (status in ('assigned', 'attended', 'missed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, volunteer_id),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (volunteer_id, church_id) references public.volunteers (id, church_id) on delete cascade
);
create index if not exists assignments_volunteer_idx on public.assignments (volunteer_id);
create index if not exists assignments_church_idx on public.assignments (church_id);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null,
  volunteer_id uuid not null,
  note text not null check (length(trim(note)) > 0),
  due date,
  assigned_to uuid references auth.users (id) on delete set null,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (volunteer_id, church_id) references public.volunteers (id, church_id) on delete cascade
);
create index if not exists followups_church_idx on public.followups (church_id, done, due);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so the rules can read memberships without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.church_role(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.memberships where church_id = c and user_id = auth.uid()
$$;

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.church_role(c) is not null or public.is_platform_admin()
$$;

create or replace function public.is_staff(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.church_role(c) in ('coordinator', 'admin'), false) or public.is_platform_admin()
$$;

create or replace function public.is_church_admin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.church_role(c) = 'admin', false) or public.is_platform_admin()
$$;

create or replace function public.my_volunteer_id(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.volunteers where church_id = c and user_id = auth.uid()
$$;

-- True when the current user is staff at a church the other user belongs to (for the People list).
create or replace function public.can_see_profile(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or public.is_platform_admin() or exists (
    select 1 from public.memberships mine
      join public.memberships theirs on theirs.church_id = mine.church_id
     where mine.user_id = auth.uid() and mine.role in ('coordinator', 'admin') and theirs.user_id = other)
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['churches', 'volunteers', 'volunteer_notes', 'events', 'assignments', 'followups'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Every new login gets a profile. The very first account becomes the platform owner.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, is_platform_admin)
  values (new.id, lower(coalesce(new.email, '')), not exists (select 1 from public.profiles))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the platform owner can grant or remove platform-owner status, and one must always remain.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin then
    if not public.is_platform_admin() then
      raise exception 'Only the platform owner can change this';
    end if;
    if old.is_platform_admin and (select count(*) from public.profiles where is_platform_admin) <= 1 then
      raise exception 'There must always be at least one platform owner';
    end if;
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- A church always keeps at least one admin.
create or replace function public.guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and (select count(*) from public.memberships where church_id = old.church_id and role = 'admin') <= 1
     and exists (select 1 from public.churches where id = old.church_id) then
    raise exception 'A church must always have at least one admin';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists memberships_guard on public.memberships;
create trigger memberships_guard before update or delete on public.memberships
  for each row execute function public.guard_membership();

-- New churches start with the areas of interest from the Power of Yes card.
create or replace function public.seed_church_ministries() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ministries (church_id, id, label, kind, hint, sort) values
    (new.id, 'childrens-liturgy', 'Children''s Liturgy', 'ministry', 'Once a month', 10),
    (new.id, 'hallow-helper', 'Hallow Helper', 'ministry', '5–10 min after Mass', 20),
    (new.id, 'parish-leadership', 'Parish Leadership', 'ministry', '', 30),
    (new.id, 'greeter-usher', 'Mass Greeter / Usher', 'ministry', '', 40),
    (new.id, 'parish-security', 'Parish Security', 'ministry', '', 50),
    (new.id, 'lawn-games', 'Outdoor Lawn Game Organizer', 'event', '', 60),
    (new.id, 'craft-flea', 'Craft Shows & Flea Market', 'event', '', 70),
    (new.id, 'pierogies', 'Pierogies', 'event', '', 80),
    (new.id, 'movie-night', 'Movie Night', 'event', '', 90),
    (new.id, 'potluck', 'International Pot Luck', 'event', '', 100),
    (new.id, 'pancake', 'All-You-Can-Eat Pancake Breakfast', 'event', '', 110)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists churches_seed on public.churches;
create trigger churches_seed after insert on public.churches
  for each row execute function public.seed_church_ministries();

-- Volunteers editing their own card cannot change staff-only fields or move it to another church.
create or replace function public.guard_volunteer_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.church_id := old.church_id;
  end if;
  if public.is_staff(new.church_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.contacted := false;
    new.source := 'online';
  else
    -- Linking an unclaimed paper card to the login with the same email is allowed (see sync_me).
    if not (old.user_id is null and new.user_id = auth.uid()
            and lower(old.email) = (select lower(email) from auth.users where id = auth.uid())) then
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

-- Child rows can never point at another church's data (also enforced by the composite foreign keys).
create or replace function public.lock_church_id() returns trigger
language plpgsql as $$
begin
  new.church_id := old.church_id;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['events', 'assignments', 'followups', 'volunteer_notes', 'invites'] loop
    execute format('drop trigger if exists %I_lock_church on public.%I', t, t);
    execute format('create trigger %I_lock_church before update on public.%I for each row execute function public.lock_church_id()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Called after every sign-in: accepts any email invitations, and links paper cards
-- (typed in by staff with this email) at the churches the person belongs to.
create or replace function public.sync_me() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_email text := (select lower(email) from auth.users where id = auth.uid());
  inv record;
begin
  if me is null or coalesce(my_email, '') = '' then return; end if;
  for inv in select * from public.invites where email = my_email loop
    insert into public.memberships (church_id, user_id, role) values (inv.church_id, me, inv.role)
    on conflict (church_id, user_id) do update set role = excluded.role
      where public.memberships.role = 'volunteer'
         or (public.memberships.role = 'coordinator' and excluded.role = 'admin');
    delete from public.invites where id = inv.id;
  end loop;
  update public.volunteers v set user_id = me
   where v.user_id is null and lower(v.email) = my_email
     and exists (select 1 from public.memberships m where m.church_id = v.church_id and m.user_id = me)
     and not exists (select 1 from public.volunteers o where o.church_id = v.church_id and o.user_id = me)
     and v.id = (select id from public.volunteers x where x.church_id = v.church_id and x.user_id is null
                  and lower(x.email) = my_email order by created_at limit 1);
end;
$$;

-- Joins the church behind a link like /#/c/st-marys as a volunteer (or the invited role).
create or replace function public.join_church(church_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select id into c from public.churches where slug = lower(church_slug) and active;
  if c is null then raise exception 'That church link is not valid'; end if;
  insert into public.memberships (church_id, user_id, role) values (c, auth.uid(), 'volunteer')
  on conflict do nothing;
  perform public.sync_me();
  return c;
end;
$$;

-- Platform owner: add a church and invite its first admin.
create or replace function public.create_church(church_slug text, name text, admin_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; e text := lower(trim(admin_email));
begin
  if not public.is_platform_admin() then raise exception 'Only the platform owner can add churches'; end if;
  insert into public.churches (slug, org_name) values (lower(trim(church_slug)), trim(name)) returning id into c;
  if e <> '' then
    insert into public.invites (church_id, email, role) values (c, e, 'admin');
    -- if that person already has an account, make them admin right away
    insert into public.memberships (church_id, user_id, role)
      select c, u.id, 'admin' from auth.users u where lower(u.email) = e
    on conflict (church_id, user_id) do update set role = 'admin';
    delete from public.invites where church_id = c and email = e
      and exists (select 1 from auth.users u where lower(u.email) = e);
  end if;
  return c;
end;
$$;

-- Church admin: invite someone by email with a role. Applied now if they already have an account.
create or replace function public.invite_to_church(c uuid, invite_email text, invite_role text) returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(invite_email)); uid uuid;
begin
  if not public.is_church_admin(c) then raise exception 'Only a church admin can invite people'; end if;
  if invite_role not in ('volunteer', 'coordinator', 'admin') then raise exception 'Unknown role'; end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is not null then
    insert into public.memberships (church_id, user_id, role) values (c, uid, invite_role)
    on conflict (church_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;
  insert into public.invites (church_id, email, role) values (c, e, invite_role)
  on conflict (church_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;

revoke execute on function public.sync_me() from public, anon;
revoke execute on function public.join_church(text) from public, anon;
revoke execute on function public.create_church(text, text, text) from public, anon;
revoke execute on function public.invite_to_church(uuid, text, text) from public, anon;
grant execute on function public.sync_me() to authenticated;
grant execute on function public.join_church(text) to authenticated;
grant execute on function public.create_church(text, text, text) to authenticated;
grant execute on function public.invite_to_church(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'churches', 'memberships', 'invites', 'ministries', 'volunteers',
                           'volunteer_notes', 'events', 'assignments', 'followups'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles
  for select to authenticated using (public.can_see_profile(id));
drop policy if exists "profiles: platform owner updates" on public.profiles;
create policy "profiles: platform owner updates" on public.profiles
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- churches: anyone can read active churches (the sign-in page shows the church's name and colors)
drop policy if exists "churches: read" on public.churches;
create policy "churches: read" on public.churches
  for select to anon, authenticated using (active or public.is_platform_admin());
drop policy if exists "churches: admin updates" on public.churches;
create policy "churches: admin updates" on public.churches
  for update to authenticated using (public.is_church_admin(id)) with check (public.is_church_admin(id));
drop policy if exists "churches: platform owner inserts" on public.churches;
create policy "churches: platform owner inserts" on public.churches
  for insert to authenticated with check (public.is_platform_admin());
drop policy if exists "churches: platform owner deletes" on public.churches;
create policy "churches: platform owner deletes" on public.churches
  for delete to authenticated using (public.is_platform_admin());

-- memberships: see your own and, as staff, your church's; admins change roles
drop policy if exists "memberships: read" on public.memberships;
create policy "memberships: read" on public.memberships
  for select to authenticated using (user_id = auth.uid() or public.is_staff(church_id));
drop policy if exists "memberships: admin manages" on public.memberships;
create policy "memberships: admin manages" on public.memberships
  for all to authenticated using (public.is_church_admin(church_id)) with check (public.is_church_admin(church_id));

-- invites
drop policy if exists "invites: staff read" on public.invites;
create policy "invites: staff read" on public.invites
  for select to authenticated using (public.is_staff(church_id));
drop policy if exists "invites: admin manages" on public.invites;
create policy "invites: admin manages" on public.invites
  for all to authenticated using (public.is_church_admin(church_id)) with check (public.is_church_admin(church_id));

-- ministries
drop policy if exists "ministries: members read" on public.ministries;
create policy "ministries: members read" on public.ministries
  for select to authenticated using (public.is_member(church_id));
drop policy if exists "ministries: staff write" on public.ministries;
create policy "ministries: staff write" on public.ministries
  for all to authenticated using (public.is_staff(church_id)) with check (public.is_staff(church_id));

-- volunteers
drop policy if exists "volunteers: read" on public.volunteers;
create policy "volunteers: read" on public.volunteers
  for select to authenticated using (user_id = auth.uid() or public.is_staff(church_id));
drop policy if exists "volunteers: create" on public.volunteers;
create policy "volunteers: create" on public.volunteers
  for insert to authenticated with check (
    public.is_staff(church_id)
    or (public.church_role(church_id) is not null and user_id = auth.uid() and public.my_volunteer_id(church_id) is null));
drop policy if exists "volunteers: update" on public.volunteers;
create policy "volunteers: update" on public.volunteers
  for update to authenticated
  using (user_id = auth.uid() or public.is_staff(church_id))
  with check (user_id = auth.uid() or public.is_staff(church_id));
drop policy if exists "volunteers: staff delete" on public.volunteers;
create policy "volunteers: staff delete" on public.volunteers
  for delete to authenticated using (public.is_staff(church_id));

-- staff-only tables
drop policy if exists "volunteer_notes: staff" on public.volunteer_notes;
create policy "volunteer_notes: staff" on public.volunteer_notes
  for all to authenticated using (public.is_staff(church_id)) with check (public.is_staff(church_id));
drop policy if exists "followups: staff" on public.followups;
create policy "followups: staff" on public.followups
  for all to authenticated using (public.is_staff(church_id)) with check (public.is_staff(church_id));

-- events: staff see all of their church's; a volunteer sees the ones they're assigned to
drop policy if exists "events: read" on public.events;
create policy "events: read" on public.events
  for select to authenticated using (
    public.is_staff(church_id)
    or exists (select 1 from public.assignments a
                where a.event_id = events.id and a.volunteer_id = public.my_volunteer_id(events.church_id)));
drop policy if exists "events: staff write" on public.events;
create policy "events: staff write" on public.events
  for all to authenticated using (public.is_staff(church_id)) with check (public.is_staff(church_id));

-- assignments
drop policy if exists "assignments: read" on public.assignments;
create policy "assignments: read" on public.assignments
  for select to authenticated using (public.is_staff(church_id) or volunteer_id = public.my_volunteer_id(church_id));
drop policy if exists "assignments: staff write" on public.assignments;
create policy "assignments: staff write" on public.assignments
  for all to authenticated using (public.is_staff(church_id)) with check (public.is_staff(church_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.churches to anon;
