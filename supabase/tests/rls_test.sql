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
select pg_temp.expect((select count(*) from churches) = 1, 'a church admin sees only their own church');

-- church 1 admin cannot touch church 2
do $$ begin
  update churches set org_name = 'Hacked' where slug = 'st-two';
  if found then raise exception 'FAIL: admin 1 edited church 2'; end if;
  begin
    insert into events (church_id, name) select id, 'Sneaky' from church_by_slug('st-two');
    raise exception 'FAIL: admin 1 created an event in church 2';
  exception when insufficient_privilege then null; end;
  begin
    perform invite_to_church((select id from church_by_slug('st-two')), 'x@example.org', 'admin');
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
    insert into volunteers (church_id, name, user_id) select id, 'Not a member', auth.uid() from church_by_slug('st-one');
    raise exception 'FAIL: card in a church they did not join';
  exception when insufficient_privilege then null; end;
  update volunteers set church_id = (select id from church_by_slug('st-one')) where name = 'Vol One';
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

-- "Can't make it": a volunteer can only use it on their own assignment, through the function
do $$ begin
  begin
    insert into followups (church_id, volunteer_id, note) select church_id, id, 'sneaky' from volunteers;
    raise exception 'FAIL: volunteer wrote a follow-up directly';
  exception when insufficient_privilege then null; end;
end $$;
select cant_make_it((select id from assignments), 'Out of town');
select pg_temp.expect((select status from assignments) = 'cant_make_it', 'volunteer can say they can''t make it');
select pg_temp.expect((select cant_reason from assignments) = 'Out of town', 'their note is saved');
select pg_temp.expect((select count(*) from followups) = 0, 'volunteer still sees no follow-ups');
do $$ begin
  begin perform cant_make_it((select id from assignments), ''); raise exception 'FAIL: said it twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select can_make_it_after_all((select id from assignments));
select pg_temp.expect((select status from assignments) = 'assigned', 'volunteer can take it back');
select cant_make_it((select id from assignments), '');
-- another volunteer cannot use it on someone else's assignment
reset role;
do $$ declare a uuid := (select id from assignments limit 1); begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  begin
    perform cant_make_it(a, '');
    raise exception 'FAIL: volunteer said can''t make it for someone else';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
set role authenticated;
-- the coordinator sees it on the roster and as a follow-up assigned to the event's creator
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select status from assignments) = 'cant_make_it', 'coordinator sees the volunteer can''t make it');
select pg_temp.expect((select count(*) from followups where assignment_id is not null and not done) = 1, 'one open follow-up for the spot (the taken-back one is closed)');
select pg_temp.expect((select note from followups where assignment_id is not null and not done) like 'Can''t make it to Pierogi batch (Jan 1). Find someone%', 'follow-up says which event');
select pg_temp.expect((select assigned_to from followups where assignment_id is not null and not done) = '00000000-0000-0000-0000-0000000000a1', 'follow-up goes to whoever created the event');
select pg_temp.expect((select count(*) from followups where assignment_id is not null and done) = 1, 'taking it back closed its follow-up');
-- coordinator puts them back on the roster: the note is cleared and the follow-up closed
update assignments set status = 'assigned' where status = 'cant_make_it';
select pg_temp.expect((select cant_reason = '' and cant_at is null from assignments), 'putting them back clears the note');
select pg_temp.expect((select count(*) from followups where assignment_id is not null and not done) = 0, 'putting them back closes the follow-up');
-- Open sign-up: volunteers sign themselves up for events a coordinator opened, until they're full
insert into events (church_id, name, date, area, needed, open_signup)
  select id, 'Open fish fry', '2030-02-01', 'pierogies', 1, true from churches where slug = 'st-one';
insert into events (church_id, name, date, area, open_signup)
  select id, 'Closed event', '2030-02-02', null, false from churches where slug = 'st-one';
insert into events (church_id, name, date, area, open_signup)
  select id, 'Usher open', '2030-02-03', 'greeter-usher', true from churches where slug = 'st-one';
insert into events (church_id, name, date, open_signup)
  select id, 'Old open event', current_date - 3, true from churches where slug = 'st-one';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into events (church_id, name, date, open_signup)
  select id, 'Church two open', '2030-02-04', true from churches where slug = 'st-two';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect((select string_agg(name, ',') from open_events((select id from churches where slug = 'st-one'))) = 'Open fish fry',
  'a volunteer sees only open, upcoming events in an area they checked');
select pg_temp.expect((select taken from open_events((select id from churches where slug = 'st-one'))) = 0, 'open events show how many spots are taken');
select pg_temp.expect((select count(*) from events where name = 'Open fish fry') = 0, 'a volunteer cannot read an open event''s row before signing up');
select pg_temp.expect((select count(*) from open_events((select id from church_by_slug('st-two')))) = 0, 'a volunteer sees no open events at a church they did not join');
select sign_up_for_event((select id from open_events((select id from churches where slug = 'st-one'))));
select pg_temp.expect((select self_signup and status = 'assigned' from assignments a join events e on e.id = a.event_id where e.name = 'Open fish fry'), 'a volunteer can sign up for an open event');
select pg_temp.expect((select count(*) from events where name = 'Open fish fry') = 1, 'the event is on their schedule once they sign up');
select pg_temp.expect((select count(*) from open_events((select id from churches where slug = 'st-one'))) = 0, 'an event they signed up for leaves their open list');
reset role;
do $$
declare
  fish uuid := (select id from events where name = 'Open fish fry');
  closed uuid := (select id from events where name = 'Closed event');
  usher uuid := (select id from events where name = 'Usher open');
  old uuid := (select id from events where name = 'Old open event');
  other uuid := (select id from events where name = 'Church two open');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  begin perform sign_up_for_event(fish); raise exception 'FAIL: signed up twice';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform sign_up_for_event(closed); raise exception 'FAIL: signed up for an event not open for sign-up';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform sign_up_for_event(usher); raise exception 'FAIL: signed up for an area they did not check';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform sign_up_for_event(old); raise exception 'FAIL: signed up for a past event';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform sign_up_for_event(other); raise exception 'FAIL: signed up at another church';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    insert into assignments (church_id, event_id, volunteer_id)
      values ((select id from church_by_slug('st-one')), usher, public.my_volunteer_id((select id from church_by_slug('st-one'))));
    raise exception 'FAIL: volunteer wrote an assignment directly';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
-- "Can't make it" reopens the spot; someone else takes it; then the first person can't come back
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select cant_make_it((select a.id from assignments a join events e on e.id = a.event_id where e.name = 'Open fish fry'), 'Sick');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select join_church('st-one');
insert into volunteers (church_id, name, ministries, user_id)
  select id, 'Vol One at St One', '{pierogies}', auth.uid() from churches where slug = 'st-one';
select pg_temp.expect((select taken from open_events((select id from churches where slug = 'st-one')) where name = 'Open fish fry') = 0,
  'a spot freed by "can''t make it" is open again');
select sign_up_for_event((select id from open_events((select id from churches where slug = 'st-one')) where name = 'Open fish fry'));
select pg_temp.expect((select count(*) from open_events((select id from churches where slug = 'st-one')) where name = 'Open fish fry') = 0, 'the second volunteer got the spot');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  begin perform can_make_it_after_all((select a.id from assignments a join events e on e.id = a.event_id where e.name = 'Open fish fry'));
    raise exception 'FAIL: came back into a full open event';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- someone removed from the church no longer sees its open events, even though their card stays
reset role;
update events set needed = 5 where name = 'Open fish fry';
delete from memberships where user_id = '00000000-0000-0000-0000-0000000000b1' and church_id = (select id from churches where slug = 'st-one');
update assignments set status = 'cant_make_it' where volunteer_id = (select id from volunteers where name = 'Vol One at St One');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select count(*) from open_events((select id from church_by_slug('st-one')))) = 0, 'a removed member sees no open events');
do $$ begin
  begin perform sign_up_for_event((select id from events where name = 'Open fish fry'));
    raise exception 'FAIL: a removed member signed up';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
insert into memberships (church_id, user_id) select id, '00000000-0000-0000-0000-0000000000b1' from churches where slug = 'st-one';
update assignments set status = 'assigned' where volunteer_id = (select id from volunteers where name = 'Vol One at St One');
update events set needed = 1 where name = 'Open fish fry';
set role authenticated;
-- the coordinator sees who signed themselves up
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select count(*) from assignments a join events e on e.id = a.event_id where e.name = 'Open fish fry' and a.self_signup) = 2, 'coordinator sees who signed themselves up');
-- a third volunteer finds it full
reset role;
update events set needed = 1, area = null where name = 'Open fish fry';
insert into auth.users values ('00000000-0000-0000-0000-0000000000b3', 'vol3@example.org');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select join_church('st-one');
insert into volunteers (church_id, name, user_id) select id, 'Vol Three', auth.uid() from churches where slug = 'st-one';
select pg_temp.expect((select taken from open_events((select id from churches where slug = 'st-one')) where name = 'Open fish fry') = 1, 'a full event shows as taken');
do $$ begin
  begin perform sign_up_for_event((select id from open_events((select id from church_by_slug('st-one'))) where name = 'Open fish fry'));
    raise exception 'FAIL: signed up for a full event';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- tidy up so the checks below see the same data as before
reset role;
delete from followups where note like '%Open fish fry%';
delete from events where name in ('Open fish fry', 'Closed event', 'Usher open', 'Old open event', 'Church two open');
delete from volunteers where name in ('Vol One at St One', 'Vol Three');
delete from memberships where church_id = (select id from churches where slug = 'st-one')
  and user_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');

-- an event that is over everywhere can't be changed
reset role;
update events set date = current_date - 2;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  begin perform cant_make_it((select id from assignments), ''); raise exception 'FAIL: changed a past event';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.expect(not event_is_over(current_date), 'an event today is not over');

-- the last admin of a church cannot be removed or demoted
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin
    update memberships set role = 'volunteer' where user_id = auth.uid();
    raise exception 'FAIL: demoted the last admin';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- only the platform owner changes a church's link name or pauses it; admins still edit its name
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin
    update churches set slug = 'st-uno' where slug = 'st-one';
    raise exception 'FAIL: a church admin changed the link name';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update churches set active = false where slug = 'st-one';
    raise exception 'FAIL: a church admin paused their church';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
update churches set org_name = 'St. One Parish Church' where slug = 'st-one';
select pg_temp.expect((select org_name from church_by_slug('st-one')) = 'St. One Parish Church', 'a church admin can still rename their church');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
update churches set org_name = 'St. One Parish', slug = 'st-uno', reminder_days = 3 where slug = 'st-one';
select pg_temp.expect((select reminder_days from churches where slug = 'st-uno') = 3, 'the platform owner edits a church''s name, link and reminders');
update churches set slug = 'st-one' where slug = 'st-uno';

-- the platform owner hands a church to a new admin who hasn't signed in yet
select pg_temp.expect(invite_to_church((select id from churches where slug = 'st-one'), 'New.Admin@example.org', 'admin') = 'invited', 'the platform owner invites a new admin');
update memberships set role = 'volunteer'
 where church_id = (select id from churches where slug = 'st-one') and user_id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect((select role from memberships where church_id = (select id from churches where slug = 'st-one')
  and user_id = '00000000-0000-0000-0000-0000000000a1') = 'volunteer', 'the old admin is now a volunteer');
-- ...and that waiting invitation can't then be cancelled or downgraded, leaving no admin at all
do $$ begin
  begin
    delete from invites where email = 'new.admin@example.org';
    raise exception 'FAIL: cancelled the only way the church has an admin';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform invite_to_church((select id from churches where slug = 'st-one'), 'new.admin@example.org', 'coordinator');
    raise exception 'FAIL: downgraded the only admin invitation';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.expect((select role from invites where email = 'new.admin@example.org') = 'admin', 'the replacement admin invitation is kept');
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000a3', 'new.admin@example.org');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select sync_me();
select pg_temp.expect(church_role((select id from churches where slug = 'st-one')) = 'admin', 'the new admin is admin after first sign-in');
-- without a waiting invitation, even the platform owner can't leave a church with no admin
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
do $$ begin
  begin
    update memberships set role = 'volunteer'
     where church_id = (select id from churches where slug = 'st-one') and user_id = '00000000-0000-0000-0000-0000000000a3';
    raise exception 'FAIL: the platform owner left a church with no admin';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- put things back as they were for the checks below
update memberships set role = 'admin'
 where church_id = (select id from churches where slug = 'st-one') and user_id = '00000000-0000-0000-0000-0000000000a1';
reset role;
delete from memberships where user_id = '00000000-0000-0000-0000-0000000000a3';
delete from profiles where id = '00000000-0000-0000-0000-0000000000a3';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a3';
set role authenticated;

-- platform owner can delete a church; everything in it goes with it
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
delete from churches where slug = 'st-two';
reset role;
select pg_temp.expect((select count(*) from volunteers where name = 'Vol One') = 0, 'deleting a church removes its data');
select pg_temp.expect((select count(*) from memberships m where not exists (select 1 from churches c where c.id = m.church_id)) = 0, 'no orphaned memberships');

-- nobody but the platform owner can list churches; a link reveals only its own church
reset role;
insert into churches (slug, org_name) values ('st-three', 'Church Three');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect((select count(*) from churches) = 1, 'a volunteer sees only their own church');
select pg_temp.expect((select count(*) from church_by_slug('st-three')) = 1, 'a church link shows that church');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from churches) = 2, 'the platform owner sees every church');
select pg_temp.as_user('');
set role anon;
do $$ begin
  begin
    perform count(*) from churches;
    raise exception 'FAIL: visitors could list churches';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.expect((select org_name from church_by_slug('st-three')) = 'Church Three', 'a visitor with the link sees that church''s name');
select pg_temp.expect((select count(*) from church_by_slug('st-')) = 0, 'a partial link name finds nothing');
reset role;

select 'ALL RLS CHECKS PASSED' as result;
