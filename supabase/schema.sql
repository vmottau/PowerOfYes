-- Church volunteer app: database schema and access rules (many churches, one database).
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run: objects are created only if missing, and functions and policies are replaced.
--
-- Who can do what
--   Platform owner : the first account ever created. Adds churches and can help in any church.
--   Church admin   : runs one church: its look, its people and roles, plus everything a coordinator does.
--   Coordinator    : sees that church's volunteers, events, follow-ups and lists; records attendance.
--   Volunteer      : their own card at that church and the events they're assigned to, and can say
--                    "I can't make it" to an upcoming one (see cant_make_it below). They can also sign
--                    themselves up for events a coordinator opened for sign-up (see sign_up_for_event).
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

-- Added for the "Can't make it" button. These lines bring an older database up to date when re-run.
alter table public.assignments add column if not exists cant_reason text not null default '' check (length(cant_reason) <= 500);
alter table public.assignments add column if not exists cant_at timestamptz;
alter table public.assignments drop constraint if exists assignments_status_check;
alter table public.assignments add constraint assignments_status_check
  check (status in ('assigned', 'attended', 'missed', 'cant_make_it'));
-- The follow-up made when a volunteer says they can't make it points at that assignment.
alter table public.followups add column if not exists assignment_id uuid references public.assignments (id) on delete set null;

-- Added for open sign-up. A coordinator ticks "Open for sign-up" on an event, and volunteers who checked
-- its area (or anyone, for a general event) can claim a spot on their own page until it's full.
alter table public.events add column if not exists open_signup boolean not null default false;
-- True when the volunteer signed themselves up, so coordinators can tell on the roster.
alter table public.assignments add column if not exists self_signup boolean not null default false;

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

-- Volunteer: "I can't make it" for one of their own upcoming events. Frees the spot and puts a
-- follow-up on the coordinators' list (assigned to whoever created the event, if they're still staff).
create or replace function public.cant_make_it(assignment uuid, reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare a record; ev record; v record; r text := left(trim(coalesce(reason, '')), 500); owner uuid;
begin
  select * into a from public.assignments where id = assignment for update;
  if a.id is null or a.volunteer_id is distinct from public.my_volunteer_id(a.church_id) then
    raise exception 'That event isn''t on your schedule';
  end if;
  if a.status <> 'assigned' then raise exception 'You''ve already let us know about this event'; end if;
  select * into ev from public.events where id = a.event_id;
  if public.event_is_over(ev.date) then raise exception 'This event has already happened'; end if;
  select * into v from public.volunteers where id = a.volunteer_id;
  update public.assignments set status = 'cant_make_it', cant_reason = r, cant_at = now() where id = a.id;
  owner := case when public.church_role_of(ev.created_by, a.church_id) in ('coordinator', 'admin') then ev.created_by end;
  insert into public.followups (church_id, volunteer_id, assignment_id, note, due, assigned_to)
  values (a.church_id, a.volunteer_id, a.id,
          'Can''t make it to ' || ev.name || coalesce(' (' || to_char(ev.date, 'FMMon FMDD') || ')', '')
            || '. Find someone to fill the spot.' || case when r <> '' then ' They said: "' || r || '"' else '' end,
          current_date, owner);
end;
$$;

-- Volunteer: takes back "I can't make it" while the event is still upcoming. Closes the follow-up it made.
create or replace function public.can_make_it_after_all(assignment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a record; ev record;
begin
  -- lock the event first, then the assignment (the same order as sign_up_for_event, so the two can't deadlock)
  select * into ev from public.events where id = (select event_id from public.assignments where id = assignment) for update;
  select * into a from public.assignments where id = assignment for update;
  if a.id is null or a.volunteer_id is distinct from public.my_volunteer_id(a.church_id) then
    raise exception 'That event isn''t on your schedule';
  end if;
  if a.status <> 'cant_make_it' then return; end if;
  if public.event_is_over(ev.date) then raise exception 'This event has already happened'; end if;
  -- on an event open for sign-up, someone else may have taken the freed spot
  if ev.open_signup and ev.needed is not null and (select count(*) from public.assignments
       where event_id = ev.id and status <> 'cant_make_it') >= ev.needed then
    raise exception 'Sorry, someone else has signed up for your spot and this event is full now';
  end if;
  -- the assignments_cant_cleared trigger clears the note and closes the follow-up
  update public.assignments set status = 'assigned' where id = a.id;
end;
$$;

-- True once a date has passed everywhere on earth (it's already tomorrow in UTC-12).
-- Churches don't store a time zone, so this is the strictest check that never blocks a same-day event.
create or replace function public.event_is_over(d date) returns boolean
language sql stable as $$
  select d is not null and d < (now() at time zone 'Etc/GMT+12')::date
$$;

-- When a "can't make it" is taken back (by the volunteer, or a coordinator's "Put back on roster"),
-- clear the note and close the "find someone" follow-up it made.
create or replace function public.clear_cant_make_it() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'cant_make_it' and new.status <> 'cant_make_it' then
    new.cant_reason := '';
    new.cant_at := null;
    update public.followups set done = true, done_at = now() where assignment_id = new.id and not done;
  end if;
  return new;
end;
$$;
drop trigger if exists assignments_cant_cleared on public.assignments;
create trigger assignments_cant_cleared before update on public.assignments
  for each row execute function public.clear_cant_make_it();

-- Volunteer: the events open for sign-up that they could join (their church, upcoming, an area they
-- checked or a general event, not already on their schedule), with how many spots are taken.
-- Full events are listed too, so volunteers can see them; sign_up_for_event refuses them.
create or replace function public.open_events(c uuid)
returns table (id uuid, name text, date date, "time" text, place text, area text, needed int, notes text,
               open_signup boolean, taken int)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.date, e.time, e.place, e.area, e.needed, e.notes, e.open_signup,
         (select count(*)::int from public.assignments t where t.event_id = e.id and t.status <> 'cant_make_it')
    from public.events e
    join public.volunteers v on v.church_id = e.church_id and v.user_id = auth.uid()
   where e.church_id = c and public.church_role(c) is not null and e.open_signup and not public.event_is_over(e.date)
     and (e.area is null or e.area = any (v.ministries))
     and not exists (select 1 from public.assignments a where a.event_id = e.id and a.volunteer_id = v.id)
   order by e.date nulls last, e.name
$$;

-- Volunteer: claim a spot on an event that's open for sign-up. The event row is locked so two people
-- can't take the last spot at the same moment.
create or replace function public.sign_up_for_event(event uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev record; me uuid; a record; taken int; new_id uuid;
begin
  select * into ev from public.events where id = event for update;
  if ev.id is null or not public.is_member(ev.church_id) then raise exception 'That event could not be found'; end if;
  me := public.my_volunteer_id(ev.church_id);
  if me is null then raise exception 'Please fill in your volunteer card first'; end if;
  if not ev.open_signup then raise exception 'This event isn''t open for sign-up'; end if;
  if public.event_is_over(ev.date) then raise exception 'This event has already happened'; end if;
  if ev.area is not null and not exists (select 1 from public.volunteers where id = me and ev.area = any (ministries)) then
    raise exception 'This event is for people who checked %. Add it to your card to sign up.',
      coalesce((select label from public.ministries where church_id = ev.church_id and id = ev.area), ev.area);
  end if;
  select * into a from public.assignments where event_id = ev.id and volunteer_id = me for update;
  if a.id is not null and a.status <> 'cant_make_it' then raise exception 'You''re already signed up for this event'; end if;
  select count(*) into taken from public.assignments where event_id = ev.id and status <> 'cant_make_it';
  if ev.needed is not null and taken >= ev.needed then raise exception 'Sorry, this event is full now'; end if;
  if a.id is not null then
    -- they had said they can't make it: put them back (the assignments_cant_cleared trigger closes the follow-up)
    update public.assignments set status = 'assigned' where id = a.id;
    return a.id;
  end if;
  insert into public.assignments (church_id, event_id, volunteer_id, self_signup)
  values (ev.church_id, ev.id, me, true) returning id into new_id;
  return new_id;
end;
$$;

-- Someone else's role at a church (for the functions above; not callable by the app).
create or replace function public.church_role_of(u uuid, c uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.memberships where church_id = c and user_id = u
$$;
revoke execute on function public.church_role_of(uuid, uuid) from public, anon, authenticated;

-- The name and look of the one church behind a link like /#/c/st-marys, for its sign-in page.
create or replace function public.church_by_slug(church_slug text)
returns table (id uuid, slug text, org_name text, app_title text, tagline text,
               primary_color text, accent_color text, logo text, active boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.org_name, c.app_title, c.tagline, c.primary_color, c.accent_color, c.logo, c.active
  from public.churches c where c.slug = lower(trim(church_slug))
$$;
revoke execute on function public.church_by_slug(text) from public;
grant execute on function public.church_by_slug(text) to anon, authenticated;

revoke execute on function public.sync_me() from public, anon;
revoke execute on function public.join_church(text) from public, anon;
revoke execute on function public.create_church(text, text, text) from public, anon;
revoke execute on function public.invite_to_church(uuid, text, text) from public, anon;
revoke execute on function public.cant_make_it(uuid, text) from public, anon;
revoke execute on function public.can_make_it_after_all(uuid) from public, anon;
grant execute on function public.cant_make_it(uuid, text) to authenticated;
grant execute on function public.can_make_it_after_all(uuid) to authenticated;
revoke execute on function public.open_events(uuid) from public, anon;
revoke execute on function public.sign_up_for_event(uuid) from public, anon;
grant execute on function public.open_events(uuid) to authenticated;
grant execute on function public.sign_up_for_event(uuid) to authenticated;
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
-- Members see only their own churches; only the platform owner sees them all.
create policy "churches: read" on public.churches
  for select to authenticated using (public.is_member(id));
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
-- Visitors never list churches. A church link looks up that one church through church_by_slug().
revoke select on public.churches from anon;

-- ---------------------------------------------------------------------------
-- Emails: reminders before events, and an alert when someone can't make it
-- ---------------------------------------------------------------------------
-- The database writes each email into email_outbox. Nothing is actually sent until
-- supabase/email-setup.sql has been run once with an email service key (see the README).
-- Until then the emails just wait in the outbox, and coordinators can see them under Manage -> Emails.

-- How many days ahead volunteers get their reminder. 0 turns reminders off for that church.
alter table public.churches add column if not exists reminder_days int not null default 2
  check (reminder_days between 0 and 14);

-- One row for the whole site: where emails come from and the site's address for links.
-- email-setup.sql fills it in. Nobody can read it from the app.
create table if not exists public.email_settings (
  id boolean primary key default true check (id),
  from_address text not null default '',
  site_url text not null default 'https://vmottau.github.io/PowerOfYes/'
);
insert into public.email_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'cant_make_it')),
  assignment_id uuid references public.assignments (id) on delete set null,
  -- the same email is never queued twice (see the keys used below)
  dedupe_key text not null unique,
  to_email text not null,
  reply_to text not null default '',
  subject text not null,
  body text not null,
  -- waiting -> sending -> sent, or failed after several tries, or cancelled when it no longer applies
  status text not null default 'waiting' check (status in ('waiting', 'sending', 'sent', 'failed', 'cancelled')),
  attempts int not null default 0,
  request_id bigint,
  sending_at timestamptz,
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
-- for a "can't make it" alert: which time they pressed it (pressing it again later is a new alert)
alter table public.email_outbox add column if not exists cant_at timestamptz;
create index if not exists email_outbox_status_idx on public.email_outbox (status, created_at);
create index if not exists email_outbox_church_idx on public.email_outbox (church_id, created_at desc);

create or replace function public.email_ok(e text) returns boolean
language sql immutable as $$
  select coalesce(trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', false)
$$;

create or replace function public.email_date(d date) returns text
language sql immutable as $$
  select to_char(d, 'FMDay, FMMonth FMDD')
$$;

-- The event's details as lines of an email.
create or replace function public.email_event_lines(ev public.events) returns text
language sql stable as $$
  select ev.name
    || E'\nWhen: ' || coalesce(public.email_date(ev.date), 'date to be announced')
                   || case when trim(ev.time) <> '' then ', ' || trim(ev.time) else '' end
    || case when trim(ev.place) <> '' then E'\nWhere: ' || trim(ev.place) else '' end
    || case when trim(ev.notes) <> '' then E'\nNotes: ' || trim(ev.notes) else '' end
$$;

create or replace function public.email_church_link(c public.churches) returns text
language sql stable security definer set search_path = public as $$
  select rtrim(coalesce((select nullif(trim(site_url), '') from public.email_settings),
                        'https://vmottau.github.io/PowerOfYes/'), '/') || '/#/c/' || c.slug
$$;

-- Every reminder that should go out (or still go out) right now, with its current wording.
-- An event counts while it's today or later; queue_reminders() picks the ones inside each church's window.
create or replace function public.reminder_candidates()
returns table (church_id uuid, assignment_id uuid, dedupe_key text, to_email text, reply_to text,
               subject text, body text, event_date date, reminder_days int)
language sql stable security definer set search_path = public as $$
  select a.church_id, a.id,
         -- a new date gets a new reminder
         'reminder:' || a.id || ':' || ev.date,
         lower(trim(v.email)),
         case when public.church_role_of(ev.created_by, a.church_id) in ('coordinator', 'admin')
              then coalesce((select p.email from public.profiles p where p.id = ev.created_by), '') else '' end,
         'Reminder: ' || ev.name || ' on ' || public.email_date(ev.date),
         'Hi ' || split_part(trim(v.name), ' ', 1) || E',\n\n'
           || E'Thank you for volunteering! This is a reminder that you''re signed up for:\n\n'
           || public.email_event_lines(ev) || E'\n\n'
           || E'If you can''t make it, please let us know so we can find someone else. Open your card and press "Can''t make it":\n'
           || public.email_church_link(c) || E'\n\n'
           || 'See you there,' || E'\n' || c.org_name,
         ev.date, c.reminder_days
  from public.assignments a
  join public.events ev on ev.id = a.event_id
  join public.volunteers v on v.id = a.volunteer_id
  join public.churches c on c.id = a.church_id
  where a.status = 'assigned' and c.active and c.reminder_days > 0
    and ev.date >= current_date and public.email_ok(v.email)
$$;
revoke execute on function public.reminder_candidates() from public, anon, authenticated;

-- Queues a reminder for every volunteer on an event coming up within their church's reminder window
-- (by default the next 2 days). Runs once a day. Someone assigned late still gets one on the next run,
-- and a reminder that was cancelled (say they were taken off and put back) is queued again.
create or replace function public.queue_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.email_outbox as o (church_id, kind, assignment_id, dedupe_key, to_email, reply_to, subject, body)
  select r.church_id, 'reminder', r.assignment_id, r.dedupe_key, r.to_email, r.reply_to, r.subject, r.body
  from public.reminder_candidates() r
  where r.event_date > current_date and r.event_date <= current_date + r.reminder_days
  on conflict (dedupe_key) do update
    set status = 'waiting', attempts = 0, error = '', request_id = null, sending_at = null, created_at = now(),
        to_email = excluded.to_email, reply_to = excluded.reply_to, subject = excluded.subject, body = excluded.body
    where o.status = 'cancelled';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.queue_reminders() from public, anon, authenticated;

-- When a volunteer says they can't make it, email whoever created the event (if they're still a
-- coordinator or admin there), otherwise the church's admins. Taking it back cancels an unsent alert.
create or replace function public.queue_cant_make_it_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev public.events; v public.volunteers; c public.churches; owner uuid;
begin
  if new.status = 'cant_make_it' and old.status is distinct from 'cant_make_it' then
    select * into ev from public.events where id = new.event_id;
    -- the event's creator, if they're still staff here and have an email address
    select p.id into owner from public.profiles p
     where p.id = ev.created_by and public.email_ok(p.email)
       and public.church_role_of(ev.created_by, new.church_id) in ('coordinator', 'admin');
    select * into v from public.volunteers where id = new.volunteer_id;
    select * into c from public.churches where id = new.church_id;
    insert into public.email_outbox (church_id, kind, assignment_id, cant_at, dedupe_key, to_email, reply_to, subject, body)
    select new.church_id, 'cant_make_it', new.id, new.cant_at,
           'cant:' || new.id || ':' || coalesce(new.cant_at, now()) || ':' || r.email,
           r.email,
           case when public.email_ok(v.email) then lower(trim(v.email)) else '' end,
           v.name || ' can''t make it to ' || ev.name || coalesce(' (' || to_char(ev.date, 'FMMon FMDD') || ')', ''),
           v.name || E' let us know they can''t make it to:\n\n'
             || public.email_event_lines(ev) || E'\n\n'
             || case when trim(new.cant_reason) <> '' then 'They said: "' || trim(new.cant_reason) || E'"\n\n' else '' end
             || E'Their spot is open again, and there''s a follow-up on your list to find someone else.\n'
             || case when trim(v.phone) <> '' or public.email_ok(v.email) then
                  'You can reach ' || split_part(trim(v.name), ' ', 1) || ' at '
                  || concat_ws(' or ', nullif(trim(v.phone), ''), case when public.email_ok(v.email) then lower(trim(v.email)) end)
                  || '.' || case when public.email_ok(v.email) then ' Replying to this email goes to them.' else '' end
                  || E'\n' else '' end
             || E'\n' || public.email_church_link(c)
    from (
      select distinct lower(trim(p.email)) as email from public.profiles p
      where public.email_ok(p.email) and (p.id = owner or (owner is null and p.id in (
        select m.user_id from public.memberships m where m.church_id = new.church_id and m.role = 'admin')))
    ) r
    on conflict (dedupe_key) do nothing;
  elsif old.status = 'cant_make_it' and new.status <> 'cant_make_it' then
    update public.email_outbox set status = 'cancelled', error = 'They said they can make it after all'
     where assignment_id = new.id and kind = 'cant_make_it' and status = 'waiting';
  end if;
  return new;
end;
$$;
drop trigger if exists assignments_cant_alert on public.assignments;
create trigger assignments_cant_alert after update of status on public.assignments
  for each row execute function public.queue_cant_make_it_alert();

-- Run just before sending. Unsent reminders get the event's current details, and anything that
-- no longer applies is not sent: a reminder for someone taken off the event, an event that moved or is
-- over, or a church that turned reminders off; an alert for someone who said they can make it after all.
create or replace function public.refresh_queued_emails() returns int
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  update public.email_outbox o
     set to_email = r.to_email, reply_to = r.reply_to, subject = r.subject, body = r.body
    from public.reminder_candidates() r
   where o.kind = 'reminder' and o.status = 'waiting' and r.dedupe_key = o.dedupe_key
     and (o.to_email, o.reply_to, o.subject, o.body) is distinct from (r.to_email, r.reply_to, r.subject, r.body);
  update public.email_outbox o set status = 'cancelled', error = 'No longer needed: taken off the event, the event changed, or reminders were turned off'
   where o.kind = 'reminder' and o.status = 'waiting'
     and not exists (select 1 from public.reminder_candidates() r where r.dedupe_key = o.dedupe_key);
  get diagnostics n = row_count;
  update public.email_outbox o set status = 'cancelled', error = 'They said they can make it after all'
   where o.kind = 'cant_make_it' and o.status = 'waiting'
     and not exists (select 1 from public.assignments a
                      where a.id = o.assignment_id and a.status = 'cant_make_it' and a.cant_at is not distinct from o.cant_at);
  get diagnostics m = row_count;
  return n + m;
end;
$$;
drop function if exists public.cancel_stale_reminders();
revoke execute on function public.refresh_queued_emails() from public, anon, authenticated;

-- Staff can see their church's emails (Manage -> Emails). Only the database itself writes them.
alter table public.email_settings enable row level security;
alter table public.email_outbox enable row level security;
revoke all on public.email_settings from anon, authenticated;
revoke all on public.email_outbox from anon, authenticated;
grant select on public.email_outbox to authenticated;
drop policy if exists "email_outbox: staff read" on public.email_outbox;
create policy "email_outbox: staff read" on public.email_outbox
  for select to authenticated using (public.is_staff(church_id));
