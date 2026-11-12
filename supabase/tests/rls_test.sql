-- Access-rule checks for the multi-church schema. Runs on plain Postgres with a stub auth schema
-- (see auth_stub.sql). Any failure raises an error; the last line prints ALL RLS CHECKS PASSED.
\set ON_ERROR_STOP 1

create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false)
$$;
create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

-- people
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000a0', 'owner@example.org'),
 ('00000000-0000-0000-0000-0000000000a1', 'admin1@example.org'),
 ('00000000-0000-0000-0000-0000000000c1', 'coord1@example.org'),
 ('00000000-0000-0000-0000-0000000000a2', 'admin2@example.org'),
 ('00000000-0000-0000-0000-0000000000b1', 'vol@example.org'),
 ('00000000-0000-0000-0000-0000000000b2', 'card@example.org');
select pg_temp.expect((select is_platform_admin from profiles where email = 'owner@example.org'), 'first account is platform owner');
select pg_temp.expect((select count(*) from profiles where is_platform_admin) = 1, 'only the first account is platform owner');

set role authenticated;

-- platform owner creates two churches
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select create_church('st-one', 'St. One Parish', 'admin1@example.org');
select create_church('st-two', 'St. Two Parish', 'admin2@example.org');
select pg_temp.expect((select count(*) from ministries) = 22, 'each new church gets the 11 card areas');

-- a non-owner cannot create churches
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin perform create_church('evil', 'Evil', ''); raise exception 'FAIL: admin created a church'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- church 1 admin: invites a coordinator, types in a paper card, makes an event
select pg_temp.expect(church_role((select id from churches where slug = 'st-one')) = 'admin', 'invited admin is admin of church 1');
select invite_to_church((select id from churches where slug = 'st-one'), 'coord1@example.org', 'coordinator');
insert into volunteers (church_id, name, email, ministries, source)
  select id, 'Card Person', 'CARD@example.org', '{pierogies}', 'card' from churches where slug = 'st-one';
insert into volunteer_notes (volunteer_id, church_id, notes) select id, church_id, 'staff note' from volunteers;
insert into events (church_id, name, date, area) select id, 'Pierogi batch', '2030-01-01', 'pierogies' from churches where slug = 'st-one';
select pg_temp.expect((select count(*) from churches) = 2, 'everyone can read the church list');

-- church 1 admin cannot touch church 2
do $$ begin
  update churches set org_name = 'Hacked' where slug = 'st-two';
  if found then raise exception 'FAIL: admin 1 edited church 2'; end if;
  begin
    insert into events (church_id, name) select id, 'Sneaky' from churches where slug = 'st-two';
    raise exception 'FAIL: admin 1 created an event in church 2';
  exception when insufficient_privilege then null; end;
  begin
    perform invite_to_church((select id from churches where slug = 'st-two'), 'x@example.org', 'admin');
    raise exception 'FAIL: admin 1 invited into church 2';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- church 2 admin sees nothing of church 1
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from volunteers) = 0, 'church 2 admin sees no church 1 volunteers');
select pg_temp.expect((select count(*) from events) = 0, 'church 2 admin sees no church 1 events');
select pg_temp.expect((select count(*) from volunteer_notes) = 0, 'church 2 admin sees no church 1 notes');
select pg_temp.expect((select count(*) from ministries) = 11, 'church 2 admin sees only their own 11 areas');
select pg_temp.expect((select count(*) from profiles) = 1, 'church 2 admin sees only their own profile');

-- coordinator signs in: invite becomes a membership
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select sync_me();
select pg_temp.expect(church_role((select id from churches where slug = 'st-one')) = 'coordinator', 'invite turns into coordinator role');
select pg_temp.expect((select count(*) from volunteers) = 1, 'coordinator sees church 1 volunteers');
insert into assignments (church_id, event_id, volunteer_id)
  select e.church_id, e.id, v.id from events e, volunteers v where v.name = 'Card Person';
insert into followups (church_id, volunteer_id, note) select church_id, id, 'Call them' from volunteers;
do $$ begin
  update memberships set role = 'admin' where user_id = auth.uid();
  if found then raise exception 'FAIL: coordinator promoted self'; end if;
end $$;

-- volunteer joins church 2 by link and fills in a card
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select join_church('st-two');
insert into volunteers (church_id, name, email, contacted, user_id)
  select id, 'Vol One', 'vol@example.org', true, auth.uid() from churches where slug = 'st-two';
select pg_temp.expect((select contacted from volunteers where name = 'Vol One') = false, 'volunteer cannot mark self contacted');
select pg_temp.expect((select count(*) from volunteers) = 1, 'volunteer sees only own card');
do $$ begin
  begin
    insert into volunteers (church_id, name, user_id) select id, 'Second', auth.uid() from churches where slug = 'st-two';
    raise exception 'FAIL: second card in same church';
  exception when insufficient_privilege or unique_violation then null; end;
  begin
    insert into volunteers (church_id, name, user_id) select id, 'Not a member', auth.uid() from churches where slug = 'st-one';
    raise exception 'FAIL: card in a church they did not join';
  exception when insufficient_privilege then null; end;
  update volunteers set church_id = (select id from churches where slug = 'st-one') where name = 'Vol One';
end $$;
select pg_temp.expect((select c.slug from volunteers v join churches c on c.id = v.church_id where v.name = 'Vol One') = 'st-two', 'card cannot be moved to another church');
select pg_temp.expect((select count(*) from followups) = 0, 'volunteer sees no follow-ups');
select pg_temp.expect((select count(*) from ministries) = 11, 'volunteer sees their church''s areas');
do $$ begin
  begin perform join_church('nope'); raise exception 'FAIL: joined a fake church'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- paper-card person joins church 1: card is linked, sees own assignment but cannot edit attendance
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select join_church('st-one');
select pg_temp.expect((select name from volunteers) = 'Card Person', 'paper card linked on join');
select pg_temp.expect((select count(*) from events) = 1, 'volunteer sees the event they are assigned to');
select pg_temp.expect((select count(*) from volunteer_notes) = 0, 'volunteer cannot read staff notes');
do $$ begin
  update assignments set status = 'attended';
  if found then raise exception 'FAIL: volunteer edited attendance'; end if;
end $$;

-- the last admin of a church cannot be removed or demoted
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin
    update memberships set role = 'volunteer' where user_id = auth.uid();
    raise exception 'FAIL: demoted the last admin';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- platform owner can delete a church; everything in it goes with it
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
delete from churches where slug = 'st-two';
reset role;
select pg_temp.expect((select count(*) from volunteers where name = 'Vol One') = 0, 'deleting a church removes its data');
select pg_temp.expect((select count(*) from memberships m where not exists (select 1 from churches c where c.id = m.church_id)) = 0, 'no orphaned memberships');

-- anonymous visitors can read active churches only
update churches set active = false where slug = 'st-one';
select pg_temp.as_user('');
set role anon;
select pg_temp.expect((select count(*) from churches) = 0, 'inactive churches are hidden from visitors');
reset role;

select 'ALL RLS CHECKS PASSED' as result;
