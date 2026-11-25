-- Checks for reminder emails and "can't make it" alerts. Runs after rls_test.sql, with email_stub.sql
-- standing in for Supabase's pg_net, Vault and pg_cron, and email-setup.sql run with test values.
-- The last line prints ALL EMAIL CHECKS PASSED.
\set ON_ERROR_STOP 1

create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false)
$$;
create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

reset role;
select pg_temp.expect((select count(*) from cron.jobs) = 3, 'setup schedules the daily reminders, the sender and the cleanup');
select pg_temp.expect((select from_address from email_settings) = 'volunteers@example.org', 'setup saves the from address');

-- a church with an admin, a coordinator, and a former coordinator
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000e1', 'admin-e@example.org'),
 ('00000000-0000-0000-0000-0000000000e2', 'coord-e@example.org'),
 ('00000000-0000-0000-0000-0000000000e3', 'former-e@example.org'),
 ('00000000-0000-0000-0000-0000000000e4', 'cara@example.org');
-- leave the churches from rls_test.sql out of it
update churches set reminder_days = 0;
delete from email_outbox;
insert into churches (slug, org_name) values ('st-mail', 'St. Mail''s Parish');
insert into memberships (church_id, user_id, role) select c.id, u.id, u.role from churches c,
  (values ('00000000-0000-0000-0000-0000000000e1'::uuid, 'admin'), ('00000000-0000-0000-0000-0000000000e2'::uuid, 'coordinator'),
          ('00000000-0000-0000-0000-0000000000e3'::uuid, 'volunteer'), ('00000000-0000-0000-0000-0000000000e4'::uuid, 'volunteer')) u(id, role)
  where slug = 'st-mail';
-- typed in by staff, so the online volunteer's login link is kept
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a0');
insert into volunteers (church_id, name, email, phone, user_id) select id, v.name, v.email, v.phone, v.uid from churches,
  (values ('Ann Able', 'ANN@example.org ', '555-0101', null::uuid), ('Bob Nomail', '', '555-0102', null),
          ('Cara Online', 'cara@example.org', '', '00000000-0000-0000-0000-0000000000e4'::uuid)) v(name, email, phone, uid)
  where slug = 'st-mail';
insert into events (church_id, name, date, time, place, notes, created_by) select id, e.name, e.date, e.time, e.place, e.notes, e.by from churches,
  (values ('Fish fry', current_date + 2, '5:00 pm', 'Parish hall', 'Wear closed shoes', '00000000-0000-0000-0000-0000000000e2'::uuid),
          ('Bake sale', current_date + 5, '', '', '', '00000000-0000-0000-0000-0000000000e2'::uuid),
          ('Coat drive', current_date + 1, '9:00 am', '', '', '00000000-0000-0000-0000-0000000000e3'::uuid),
          ('Pancakes', current_date - 1, '', '', '', '00000000-0000-0000-0000-0000000000e2'::uuid)) e(name, date, time, place, notes, by)
  where slug = 'st-mail';
insert into assignments (church_id, event_id, volunteer_id)
  select e.church_id, e.id, v.id from events e join volunteers v on v.church_id = e.church_id
  join churches c on c.id = e.church_id where c.slug = 'st-mail';

-- reminders
select pg_temp.expect(queue_reminders() = 4, 'reminders for Ann and Cara on the two events in the next 2 days');
select pg_temp.expect(queue_reminders() = 0, 'running it again queues nothing new');
select pg_temp.expect((select count(*) from email_outbox where kind = 'reminder' and to_email = 'ann@example.org') = 2, 'addresses are cleaned up');
select pg_temp.expect((select count(*) from email_outbox where subject like '%Bake sale%' or subject like '%Pancakes%') = 0, 'no reminder for events too far off or over');
select pg_temp.expect((select subject from email_outbox where subject like '%Fish fry%' limit 1) = 'Reminder: Fish fry on ' || to_char(current_date + 2, 'FMDay, FMMonth FMDD'), 'subject names the event and day');
select pg_temp.expect((select body from email_outbox where subject like '%Fish fry%' and to_email = 'ann@example.org')
  like E'Hi Ann,%Fish fry\nWhen: %, 5:00 pm\nWhere: Parish hall\nNotes: Wear closed shoes%https://example.org/app/#/c/st-mail%St. Mail''s Parish', 'body has the details and the church link');
select pg_temp.expect((select reply_to from email_outbox where subject like '%Fish fry%' limit 1) = 'coord-e@example.org', 'replies go to the coordinator who made the event');
select pg_temp.expect((select reply_to from email_outbox where subject like '%Coat drive%' limit 1) = '', 'no reply-to when the event''s creator is no longer staff');
update churches set reminder_days = 7 where slug = 'st-mail';
select pg_temp.expect(queue_reminders() = 2, 'a longer window picks up the bake sale');
update churches set reminder_days = 0 where slug = 'st-mail';
delete from email_outbox where subject like '%Bake sale%';
select pg_temp.expect(queue_reminders() = 0, 'reminders can be turned off');
update churches set reminder_days = 2 where slug = 'st-mail';

-- sending: two at a time, then results come back
select pg_temp.expect(send_queued_emails() = 2, 'sends two per run');
select pg_temp.expect((select count(*) from email_outbox where status = 'sending') = 2, 'they are marked as sending');
select pg_temp.expect((select bool_and(url = 'https://api.brevo.com/v3/smtp/email') from net.sent), 'a Brevo key sends through Brevo');
select pg_temp.expect((select body->'sender' from net.sent order by id limit 1) = '{"name": "St. Mail''s Parish", "email": "volunteers@example.org"}', 'sender shows the church name');
select pg_temp.expect((select headers->>'api-key' from net.sent order by id limit 1) = 'xkeysib-test-key', 'uses the saved key');
select pg_temp.expect((select bool_and(s.body->'to' = jsonb_build_array(jsonb_build_object('email', o.to_email)) and s.body->>'textContent' = o.body)
  from net.sent s join email_outbox o on o.request_id = s.id), 'Brevo gets the address and text');
select pg_temp.expect((select bool_and((s.body ? 'replyTo') = (o.reply_to <> '') and coalesce(s.body->'replyTo'->>'email', '') = o.reply_to)
  from net.sent s join email_outbox o on o.request_id = s.id), 'reply-to is passed along when there is one');
insert into net._http_response (id, status_code, content) select id, 200, '{"id":"x"}' from net.sent order by id limit 1;
insert into net._http_response (id, status_code, content) select id, 429, 'slow down' from net.sent order by id desc limit 1;
select send_queued_emails();
select pg_temp.expect((select count(*) from email_outbox where status = 'sent' and sent_at is not null) = 1, 'a 200 answer marks it sent');
select pg_temp.expect((select attempts from email_outbox where error = '' and status <> 'sent' order by attempts limit 1) <= 1, 'a busy answer is retried without counting as a failure');
-- a rejected email is retried, then given up on
update email_outbox set status = 'waiting' where status = 'sending';
do $$ declare i int; begin
  for i in 1..6 loop
    perform send_queued_emails();
    insert into net._http_response (id, status_code, content)
      select request_id, 422, '{"message":"bad address"}' from email_outbox where status = 'sending'
      on conflict (id) do nothing;
  end loop;
end $$;
select send_queued_emails();
select pg_temp.expect((select count(*) from email_outbox where status = 'failed' and error like '422:%bad address%') >= 1, 'repeatedly rejected emails end up failed, with the reason');

-- a Resend key (for a church with its own domain) sends through Resend instead
update vault.secrets set secret = 're_test_key' where name = 'email_api_key';
update email_outbox set status = 'waiting' where status in ('sending', 'failed');
delete from net.sent;
select send_queued_emails();
select pg_temp.expect((select bool_and(url = 'https://api.resend.com/emails') from net.sent) and (select count(*) from net.sent) = 2, 'a Resend key sends through Resend');
select pg_temp.expect((select body->>'from' from net.sent order by id limit 1) = '"St. Mail''s Parish" <volunteers@example.org>', 'Resend from shows the church name');
select pg_temp.expect((select headers->>'Authorization' from net.sent order by id limit 1) = 'Bearer re_test_key', 'Resend uses the saved key');
select pg_temp.expect((select bool_and((s.body ? 'reply_to') = (o.reply_to <> '') and coalesce(s.body->>'reply_to', '') = o.reply_to)
  from net.sent s join email_outbox o on o.request_id = s.id), 'Resend gets the reply-to');

-- a reminder for someone taken off the event is not sent
delete from email_outbox; delete from net.sent;
select queue_reminders();
delete from assignments where id = (select assignment_id from email_outbox where to_email = 'ann@example.org' and subject like '%Coat drive%');
select send_queued_emails();
select pg_temp.expect((select status from email_outbox where to_email = 'ann@example.org' and subject like '%Coat drive%') = 'cancelled', 'reminder cancelled when the person is taken off');

-- can't make it: the event's coordinator gets an email, replies go to the volunteer
delete from email_outbox;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select cant_make_it((select a.id from assignments a join events e on e.id = a.event_id where e.name = 'Fish fry' and a.volunteer_id = my_volunteer_id(a.church_id)), 'Out of town');
reset role;
select pg_temp.expect((select count(*) from email_outbox where kind = 'cant_make_it') = 1, 'one alert');
select pg_temp.expect((select to_email from email_outbox where kind = 'cant_make_it') = 'coord-e@example.org', 'alert goes to the coordinator who made the event');
select pg_temp.expect((select reply_to from email_outbox where kind = 'cant_make_it') = 'cara@example.org', 'replying reaches the volunteer');
select pg_temp.expect((select subject from email_outbox where kind = 'cant_make_it') = 'Cara Online can''t make it to Fish fry (' || to_char(current_date + 2, 'FMMon FMDD') || ')', 'alert subject');
select pg_temp.expect((select body from email_outbox where kind = 'cant_make_it') like '%They said: "Out of town"%', 'alert includes their reason');
-- taking it back before it's sent cancels it
set role authenticated;
select can_make_it_after_all((select a.id from assignments a join events e on e.id = a.event_id where e.name = 'Fish fry' and a.volunteer_id = my_volunteer_id(a.church_id)));
reset role;
select pg_temp.expect((select status from email_outbox where kind = 'cant_make_it') = 'cancelled', 'taking it back cancels the unsent alert');
-- an event made by someone who's no longer staff: the church admins hear about it
set role authenticated;
select cant_make_it((select a.id from assignments a join events e on e.id = a.event_id where e.name = 'Coat drive' and a.volunteer_id = my_volunteer_id(a.church_id)), '');
reset role;
select pg_temp.expect((select string_agg(to_email, ',') from email_outbox where kind = 'cant_make_it' and status = 'waiting') = 'admin-e@example.org', 'falls back to the church admins');
select pg_temp.expect((select body from email_outbox where kind = 'cant_make_it' and status = 'waiting') not like '%They said%', 'no reason line when they gave none');

-- who can see the outbox
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.expect((select count(*) from email_outbox) > 0, 'a coordinator sees their church''s emails');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((select count(*) from email_outbox) = 0, 'another church''s staff see none of them');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select pg_temp.expect((select count(*) from email_outbox) = 0, 'volunteers see none');
do $$ begin
  begin insert into email_outbox (church_id, kind, dedupe_key, to_email, subject, body)
    select id, 'reminder', 'x', 'x@example.org', 'spam', 'spam' from churches; raise exception 'FAIL: wrote an email';
  exception when insufficient_privilege then null; end;
  begin perform * from email_settings; raise exception 'FAIL: read email settings';
  exception when insufficient_privilege then null; end;
  begin perform send_queued_emails(); raise exception 'FAIL: ran the sender';
  exception when insufficient_privilege then null; end;
  begin perform queue_reminders(); raise exception 'FAIL: queued reminders';
  exception when insufficient_privilege then null; end;
end $$;
-- an admin can change the reminder window, a coordinator can't
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
update churches set reminder_days = 5 where slug = 'st-mail';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect((select reminder_days from churches where slug = 'st-mail') = 2, 'a coordinator can''t change the reminder window');
update churches set reminder_days = 3 where slug = 'st-mail';
select pg_temp.expect((select reminder_days from churches where slug = 'st-mail') = 3, 'an admin can');
reset role;

select 'ALL EMAIL CHECKS PASSED' as result;
