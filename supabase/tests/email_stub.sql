-- Minimal stand-ins for the Supabase extensions email-setup.sql uses (pg_net, Vault, pg_cron),
-- so the email logic can be tested on plain Postgres. Nothing is really sent: net.http_post just records the request.
create schema net; create schema vault; create schema cron; create schema if not exists extensions;
create table net._http_response (id bigint primary key, status_code int, content text, timed_out boolean, error_msg text, created timestamptz default now());
create table net.sent (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.sent (url, body, headers) values (url, body, headers) returning id $$;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text, d text default '') returns uuid language sql as $$
  insert into vault.secrets (name, secret, description) values (n, s, d) returning id $$;
create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;
create table cron.jobs (name text primary key, schedule text, command text);
create table cron.job_run_details (end_time timestamptz);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
  insert into cron.jobs values (n, s, c) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
