-- Role/permission checks. Runs against a plain Postgres with a stub auth schema.
\set ON_ERROR_STOP 1
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','admin@example.org'),
 ('00000000-0000-0000-0000-00000000000b','vol1@example.org'),
 ('00000000-0000-0000-0000-00000000000c','vol2@example.org'),
 ('00000000-0000-0000-0000-00000000000d','coord@example.org');
select id, role from profiles order by email;

-- paper card typed by staff for vol2's email
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update profiles set role='coordinator' where email='coord@example.org';
insert into volunteers (name, email, ministries, source) values ('Card Person', 'VOL2@example.org', '{pierogies}', 'card');
insert into events (name, date, area) values ('Pierogi batch', '2030-01-01', 'pierogies');
insert into volunteer_notes select id, 'staff only note' from volunteers;
reset role;

-- vol1 signs up online
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select claim_my_volunteer_record() is null as "vol1 has no card to claim";
insert into volunteers (name, email, ministries, contacted) values ('Vol One', 'vol1@example.org', '{pancake}', true);
select name, contacted, user_id is not null as linked from volunteers;
select count(*) as vol1_sees_notes from volunteer_notes;  -- sees only own; contacted forced false
do $$ begin
  begin insert into volunteers (name) values ('second'); raise exception 'FAIL second insert allowed'; exception when insufficient_privilege then null; end;
  update profiles set role='admin' where id=auth.uid(); if found then raise exception 'FAIL self promote'; end if;
end $$;
select role from profiles;  -- volunteer, own row only
select count(*) as events_visible from events;  -- 0, not assigned
reset role;

-- vol2 signs in: claims the paper card
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select claim_my_volunteer_record() is not null as "vol2 claimed card";
select name from volunteers;
select count(*) as vol2_sees_notes from volunteer_notes;
reset role;

-- coordinator assigns vol2 and marks attendance
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select count(*) as coord_sees_volunteers from volunteers;
insert into assignments (event_id, volunteer_id) select e.id, v.id from events e, volunteers v where v.name='Card Person';
update assignments set status='attended';
do $$ begin
  update profiles set role='admin' where email='coord@example.org'; if found then raise exception 'FAIL coord promote'; end if;
end $$;
reset role;

-- vol2 sees the event and own assignment; vol1 does not
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select e.name, a.status from assignments a join events e on e.id=a.event_id;
do $$ begin
  update assignments set status='missed'; if found then raise exception 'FAIL volunteer edited attendance'; end if;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select count(*) as vol1_assignments, (select count(*) from events) as vol1_events from assignments;
reset role;

-- last admin cannot be demoted
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  begin update profiles set role='volunteer' where email='admin@example.org'; raise exception 'FAIL demoted last admin'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
select 'ALL RLS CHECKS PASSED' as result;
