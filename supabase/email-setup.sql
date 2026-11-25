-- Turns on email sending: reminders before events and "can't make it" alerts.
-- Run this once in the Supabase dashboard (SQL Editor -> New query -> paste -> Run),
-- AFTER schema.sql, and after filling in the three lines marked FILL IN just below.
-- It is safe to run again, for example to change the "from" address or the key.
-- Emails go out through Brevo (brevo.com), which can send from an ordinary email address.
-- A Resend (resend.com) key works too, for a church with its own web domain: the key tells them apart.
-- See "Email reminders" in the README.

do $$
declare
  new_key  text := 'PASTE-YOUR-KEY-HERE';                      -- FILL IN: your Brevo API key (starts with xkeysib-)
  new_from text := 'volunteers@your-church.org';               -- FILL IN: the sender address you confirmed in Brevo
  new_site text := 'https://vmottau.github.io/PowerOfYes/';    -- FILL IN if the site has a different address
  sid uuid;
begin
  if new_from like '%your-church.org' or not public.email_ok(new_from) then
    raise exception 'Fill in the "from" address at the top of this file first.';
  end if;
  update public.email_settings set from_address = lower(trim(new_from)), site_url = trim(new_site);
  select id into sid from vault.secrets where name = 'email_api_key';
  if new_key like 'PASTE%' or trim(new_key) = '' then
    -- Running it again without the key keeps the key saved last time.
    if sid is null then raise exception 'Paste your email service key at the top of this file first.'; end if;
  elsif sid is null then
    perform vault.create_secret(trim(new_key), 'email_api_key', 'Brevo or Resend API key for volunteer emails');
  else
    perform vault.update_secret(sid, trim(new_key));
  end if;
end $$;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Sends what's waiting in the outbox (alerts first), a couple at a time (Resend allows only a few emails per second),
-- and checks how the earlier ones went. Runs every minute.
create or replace function public.send_queued_emails(batch int default 2) returns int
language plpgsql security definer set search_path = public as $$
declare
  key text; cfg public.email_settings; r record; resp record; req bigint; n int := 0;
begin
  -- 1. How did the earlier sends go?
  for r in select * from public.email_outbox where status = 'sending' for update skip locked loop
    select status_code, error_msg, content::text as content, timed_out into resp
      from net._http_response where id = r.request_id;
    if not found then
      -- no answer yet; if there's still none after 10 minutes, try again
      if r.sending_at < now() - interval '10 minutes' then
        update public.email_outbox set status = case when attempts >= 5 then 'failed' else 'waiting' end,
               error = 'No answer from the email service' where id = r.id;
      end if;
    elsif resp.status_code between 200 and 299 then
      update public.email_outbox set status = 'sent', sent_at = now(), error = '' where id = r.id;
    elsif resp.status_code = 429 then
      -- too many at once: wait and try again without counting it as a failure
      update public.email_outbox set status = 'waiting', attempts = greatest(attempts - 1, 0) where id = r.id;
    else
      update public.email_outbox
         set status = case when attempts >= 5 or (resp.status_code in (400, 401, 403, 422) and attempts >= 2) then 'failed' else 'waiting' end,
             error = left(coalesce(resp.status_code::text || ': ', '') || coalesce(resp.content, resp.error_msg, 'unknown error'), 500)
       where id = r.id;
    end if;
  end loop;

  perform public.refresh_queued_emails();

  -- 2. Send the next few.
  select decrypted_secret into key from vault.decrypted_secrets where name = 'email_api_key';
  select * into cfg from public.email_settings;
  if key is null or not public.email_ok(cfg.from_address) then return 0; end if;
  for r in
    select o.*, c.org_name from public.email_outbox o join public.churches c on c.id = o.church_id
     where o.status = 'waiting'
     -- "can't make it" alerts go before the morning's reminders
     order by o.kind = 'cant_make_it' desc, o.created_at limit batch for update of o skip locked
  loop
    if key like 're\_%' then
      -- Resend
      req := net.http_post(
        url := 'https://api.resend.com/emails',
        body := jsonb_build_object(
                  'from', '"' || replace(replace(r.org_name, '"', ''), '\', '') || '" <' || trim(cfg.from_address) || '>',
                  'to', jsonb_build_array(r.to_email),
                  'subject', r.subject,
                  'text', r.body)
                || case when r.reply_to <> '' then jsonb_build_object('reply_to', r.reply_to) else '{}'::jsonb end,
        headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
        timeout_milliseconds := 10000);
    else
      -- Brevo
      req := net.http_post(
        url := 'https://api.brevo.com/v3/smtp/email',
        body := jsonb_build_object(
                  'sender', jsonb_build_object('name', r.org_name, 'email', trim(cfg.from_address)),
                  'to', jsonb_build_array(jsonb_build_object('email', r.to_email)),
                  'subject', r.subject,
                  'textContent', r.body)
                || case when r.reply_to <> '' then jsonb_build_object('replyTo', jsonb_build_object('email', r.reply_to)) else '{}'::jsonb end,
        headers := jsonb_build_object('api-key', key, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 10000);
    end if;
    update public.email_outbox set status = 'sending', request_id = req, attempts = attempts + 1, sending_at = now()
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.send_queued_emails(int) from public, anon, authenticated;

-- The schedule (times are UTC). 14:00 UTC is 9 am Eastern / 8 am Central in winter.
select cron.schedule('volunteer-reminders', '0 14 * * *', 'select public.queue_reminders()');
select cron.schedule('volunteer-emails-send', '* * * * *', 'select public.send_queued_emails()');
-- Keep cron's own run history from piling up.
select cron.schedule('volunteer-emails-cleanup', '30 3 * * *',
  $c$delete from cron.job_run_details where end_time < now() - interval '7 days'$c$);
