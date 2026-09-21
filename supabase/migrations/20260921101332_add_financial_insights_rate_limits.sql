create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table private.financial_insight_request_events (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
    requested_at timestamptz not null default clock_timestamp()
);

create index financial_insight_request_events_user_time_idx
on private.financial_insight_request_events (user_id, requested_at desc);

create index financial_insight_request_events_ip_time_idx
on private.financial_insight_request_events (ip_hash, requested_at desc);

create table private.financial_insight_request_locks (
    user_id uuid primary key references auth.users(id) on delete cascade,
    request_token uuid not null unique default gen_random_uuid(),
    acquired_at timestamptz not null default clock_timestamp(),
    expires_at timestamptz not null
);

create table private.financial_insight_cache (
    user_id uuid not null references auth.users(id) on delete cascade,
    cache_key text not null,
    response jsonb not null,
    created_at timestamptz not null default clock_timestamp(),
    expires_at timestamptz not null,
    primary key (user_id, cache_key),
    check (char_length(cache_key) between 1 and 80),
    check (jsonb_typeof(response) = 'object'),
    check (octet_length(response::text) <= 100000)
);

alter table private.financial_insight_request_events enable row level security;
alter table private.financial_insight_request_locks enable row level security;
alter table private.financial_insight_cache enable row level security;

create or replace function public.begin_financial_insights_request(
    p_user_id uuid,
    p_ip_hash text,
    p_cache_key text
)
returns table (
    decision text,
    retry_after_seconds integer,
    request_token uuid,
    cached_response jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_time timestamptz := clock_timestamp();
    event_count integer;
    oldest_event timestamptz;
    active_lock_expires_at timestamptz;
    cached_value jsonb;
    new_request_token uuid;
begin
    if p_user_id is null then
        raise exception 'A user ID is required.' using errcode = '22023';
    end if;
    if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'A valid IP hash is required.' using errcode = '22023';
    end if;
    if p_cache_key is null or char_length(p_cache_key) not between 1 and 80 then
        raise exception 'A valid cache key is required.' using errcode = '22023';
    end if;

    -- Serialize checks for a shared IP and then for a user so parallel Edge
    -- Function instances cannot pass the counters or acquire duplicate work.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial-insights:ip:' || p_ip_hash, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial-insights:user:' || p_user_id::text, 0));

    delete from private.financial_insight_request_events
    where requested_at <= current_time - interval '24 hours';
    delete from private.financial_insight_request_locks
    where expires_at <= current_time;
    delete from private.financial_insight_cache
    where expires_at <= current_time;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where user_id = p_user_id
      and requested_at > current_time - interval '1 minute';

    if event_count >= 3 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '1 minute' - current_time))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where user_id = p_user_id
      and requested_at > current_time - interval '1 hour';

    if event_count >= 15 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '1 hour' - current_time))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where user_id = p_user_id
      and requested_at > current_time - interval '24 hours';

    if event_count >= 30 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '24 hours' - current_time))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where ip_hash = p_ip_hash
      and requested_at > current_time - interval '1 hour';

    if event_count >= 60 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '1 hour' - current_time))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select response
    into cached_value
    from private.financial_insight_cache
    where user_id = p_user_id
      and cache_key = p_cache_key
      and expires_at > current_time;

    if found then
        insert into private.financial_insight_request_events (user_id, ip_hash, requested_at)
        values (p_user_id, p_ip_hash, current_time);

        return query select 'cache_hit'::text, 0, null::uuid, cached_value;
        return;
    end if;

    select expires_at
    into active_lock_expires_at
    from private.financial_insight_request_locks
    where user_id = p_user_id;

    if found then
        return query select 'concurrent_request'::text,
            greatest(1, ceil(extract(epoch from active_lock_expires_at - current_time))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    new_request_token := gen_random_uuid();
    insert into private.financial_insight_request_locks (
        user_id, request_token, acquired_at, expires_at
    ) values (
        p_user_id, new_request_token, current_time, current_time + interval '60 seconds'
    );

    insert into private.financial_insight_request_events (user_id, ip_hash, requested_at)
    values (p_user_id, p_ip_hash, current_time);

    return query select 'allowed'::text, 0, new_request_token, null::jsonb;
end;
$$;

create or replace function public.finish_financial_insights_request(
    p_user_id uuid,
    p_request_token uuid,
    p_cache_key text,
    p_response jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    released_user_id uuid;
begin
    if p_user_id is null or p_request_token is null then
        return false;
    end if;

    delete from private.financial_insight_request_locks
    where user_id = p_user_id
      and request_token = p_request_token
    returning user_id into released_user_id;

    if released_user_id is null then
        return false;
    end if;

    if p_response is not null then
        if p_cache_key is null or char_length(p_cache_key) not between 1 and 80 then
            raise exception 'A valid cache key is required.' using errcode = '22023';
        end if;
        if jsonb_typeof(p_response) <> 'object' or octet_length(p_response::text) > 100000 then
            raise exception 'The cached response is invalid.' using errcode = '22023';
        end if;

        insert into private.financial_insight_cache (
            user_id, cache_key, response, created_at, expires_at
        ) values (
            p_user_id, p_cache_key, p_response, clock_timestamp(), clock_timestamp() + interval '12 minutes'
        )
        on conflict (user_id, cache_key) do update
        set response = excluded.response,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at;
    end if;

    return true;
end;
$$;

revoke all on function public.begin_financial_insights_request(uuid, text, text)
from public, anon, authenticated;
revoke all on function public.finish_financial_insights_request(uuid, uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function public.begin_financial_insights_request(uuid, text, text)
to service_role;
grant execute on function public.finish_financial_insights_request(uuid, uuid, text, jsonb)
to service_role;

comment on function public.begin_financial_insights_request(uuid, text, text) is
'Atomically enforces financial-insights user/IP limits, cache lookup, and one active request per user.';
comment on function public.finish_financial_insights_request(uuid, uuid, text, jsonb) is
'Releases a financial-insights request lock and optionally caches a successful response for 12 minutes.';
