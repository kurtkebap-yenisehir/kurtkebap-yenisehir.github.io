-- Run this entire file in the new business project's SQL Editor.
-- Re-running it preserves existing events and owner accounts.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists private.analytics_events (
  event_id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  event_name text not null check (event_name in (
    'page_view', 'menu_open', 'order_open', 'trendyol_click', 'migros_click',
    'yemeksepeti_click', 'google_review_click', 'instagram_click', 'phone_click'
  )),
  page text not null check (page in ('/', '/index.html', '/baglantilar.html')),
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_created_at_idx on private.analytics_events(created_at);

create table if not exists private.analytics_rate_buckets (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  hits integer not null check (hits > 0 and hits <= 301),
  expires_at timestamptz not null,
  primary key (ip_hash, bucket_start)
);
create index if not exists analytics_rate_buckets_expiry_idx on private.analytics_rate_buckets(expires_at);

create table if not exists private.analytics_maintenance (
  singleton boolean primary key default true check (singleton),
  last_cleaned_at timestamptz not null default '-infinity'::timestamptz
);
insert into private.analytics_maintenance(singleton) values (true) on conflict do nothing;

alter table private.admins enable row level security;
alter table private.analytics_events enable row level security;
alter table private.analytics_rate_buckets enable row level security;
alter table private.analytics_maintenance enable row level security;
-- No browser role receives a direct table policy or grant. These RPCs are the
-- only data path, and only the Edge Function's service role can execute them.
revoke all on private.admins, private.analytics_events,
  private.analytics_rate_buckets, private.analytics_maintenance
  from public, anon, authenticated, service_role;

create or replace function private.analytics_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean boolean;
begin
  if not exists (
    select 1 from private.analytics_maintenance
    where singleton and last_cleaned_at < now() - interval '1 hour'
  ) then return; end if;
  -- Concurrent requests skip cleanup instead of all deleting the same rows.
  if not pg_catalog.pg_try_advisory_xact_lock(214533, 1) then return; end if;
  update private.analytics_maintenance set last_cleaned_at = now()
    where singleton and last_cleaned_at < now() - interval '1 hour'
    returning singleton into v_clean;
  if v_clean is true then
    delete from private.analytics_events where created_at < now() - interval '90 days';
    delete from private.analytics_rate_buckets where expires_at <= now();
  end if;
end;
$$;
revoke all on function private.analytics_cleanup() from public, anon, authenticated, service_role;

create or replace function public.analytics_record(
  p_event_id uuid, p_visitor_id uuid, p_session_id uuid,
  p_event_name text, p_page text, p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_bucket timestamptz := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from now()) / 600) * 600
  );
  v_hits integer;
begin
  if p_event_id is null or p_visitor_id is null or p_session_id is null
     or p_event_name is null or p_page is null or p_ip_hash is null
     or p_event_name not in (
       'page_view', 'menu_open', 'order_open', 'trendyol_click', 'migros_click',
       'yemeksepeti_click', 'google_review_click', 'instagram_click', 'phone_click'
     ) or p_page not in ('/', '/index.html', '/baglantilar.html')
     or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid analytics event' using errcode = '22023';
  end if;

  perform private.analytics_cleanup();
  if exists (select 1 from private.analytics_events where event_id = p_event_id) then
    return true;
  end if;

  -- A shared restaurant Wi-Fi address can submit up to 300 events per 10-minute
  -- window. The daily HMAC changes each UTC day and is never stored in events.
  insert into private.analytics_rate_buckets as bucket(ip_hash, bucket_start, hits, expires_at)
    values (p_ip_hash, v_bucket, 1, v_bucket + interval '20 minutes')
    on conflict (ip_hash, bucket_start) do update
      set hits = least(bucket.hits + 1, 301)
    returning hits into v_hits;
  if v_hits > 300 then return false; end if;

  insert into private.analytics_events(event_id, visitor_id, session_id, event_name, page, created_at)
    values (p_event_id, p_visitor_id, p_session_id, p_event_name, p_page, v_now)
    on conflict (event_id) do nothing;
  return true;
end;
$$;
revoke all on function public.analytics_record(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.analytics_record(uuid, uuid, uuid, text, text, text) to service_role;

create or replace function public.analytics_report(p_user_id uuid, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_end_date date := (now() at time zone 'Europe/Istanbul')::date;
  v_start_date date;
  v_start timestamptz;
  v_until timestamptz;
  v_result jsonb;
begin
  if p_user_id is null or not exists (select 1 from private.admins where user_id = p_user_id) then
    raise exception 'Analytics owner access required' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (1, 7, 30) then
    raise exception 'Invalid report period' using errcode = '22023';
  end if;
  perform private.analytics_cleanup();
  v_start_date := v_end_date - (p_days - 1);
  v_start := v_start_date::timestamp at time zone 'Europe/Istanbul';
  v_until := (v_end_date + 1)::timestamp at time zone 'Europe/Istanbul';

  with filtered as materialized (
    select visitor_id, session_id, event_name, page,
      (created_at at time zone 'Europe/Istanbul')::date as day
    from private.analytics_events
    where created_at >= v_start and created_at < v_until
  ), days as (
    select value::date as day from pg_catalog.generate_series(
      v_start_date::timestamp, v_end_date::timestamp, interval '1 day'
    ) as value
  ), daily_counts as (
    select day, count(distinct visitor_id) as visitors,
      count(*) filter (where event_name = 'page_view') as page_views
    from filtered group by day
  ), event_counts as (
    select event_name, count(*) as total from filtered group by event_name
  ), page_counts as (
    select page, count(*) as total from filtered where event_name = 'page_view' group by page
  )
  select pg_catalog.jsonb_build_object(
    'summary', (
      select pg_catalog.jsonb_build_object(
        'visitors', count(distinct visitor_id),
        'sessions', count(distinct session_id),
        'page_views', count(*) filter (where event_name = 'page_view'),
        'button_clicks', count(*) filter (where event_name <> 'page_view')
      ) from filtered
    ),
    'daily', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'date', pg_catalog.to_char(days.day, 'YYYY-MM-DD'),
        'visitors', coalesce(daily_counts.visitors, 0),
        'page_views', coalesce(daily_counts.page_views, 0)
      ) order by days.day)
      from days left join daily_counts using (day)
    ),
    'events', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_name', names.name, 'count', coalesce(event_counts.total, 0)
      ) order by names.position)
      from pg_catalog.unnest(array[
        'page_view', 'menu_open', 'order_open', 'trendyol_click', 'migros_click',
        'yemeksepeti_click', 'google_review_click', 'instagram_click', 'phone_click'
      ]) with ordinality as names(name, position)
      left join event_counts on event_counts.event_name = names.name
    ),
    'pages', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'page', names.name, 'page_views', coalesce(page_counts.total, 0)
      ) order by names.position)
      from pg_catalog.unnest(array['/', '/index.html', '/baglantilar.html'])
        with ordinality as names(name, position)
      left join page_counts on page_counts.page = names.name
    ),
    'updated_at', pg_catalog.to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'start_date', pg_catalog.to_char(v_start_date, 'YYYY-MM-DD'),
    'end_date', pg_catalog.to_char(v_end_date, 'YYYY-MM-DD')
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.analytics_report(uuid, integer) from public, anon, authenticated;
grant execute on function public.analytics_report(uuid, integer) to service_role;

commit;
