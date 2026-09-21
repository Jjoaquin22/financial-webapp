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
    rate_limit_now timestamptz := clock_timestamp();
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

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial-insights:ip:' || p_ip_hash, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial-insights:user:' || p_user_id::text, 0));

    delete from private.financial_insight_request_events
    where requested_at <= rate_limit_now - interval '24 hours';
    delete from private.financial_insight_request_locks
    where expires_at <= rate_limit_now;
    delete from private.financial_insight_cache
    where expires_at <= rate_limit_now;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where user_id = p_user_id
      and requested_at > rate_limit_now - interval '1 minute';

    if event_count >= 3 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '1 minute' - rate_limit_now))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where user_id = p_user_id
      and requested_at > rate_limit_now - interval '1 hour';

    if event_count >= 15 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '1 hour' - rate_limit_now))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where user_id = p_user_id
      and requested_at > rate_limit_now - interval '24 hours';

    if event_count >= 30 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '24 hours' - rate_limit_now))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.financial_insight_request_events
    where ip_hash = p_ip_hash
      and requested_at > rate_limit_now - interval '1 hour';

    if event_count >= 60 then
        return query select 'rate_limited'::text,
            greatest(1, ceil(extract(epoch from oldest_event + interval '1 hour' - rate_limit_now))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    select response
    into cached_value
    from private.financial_insight_cache
    where user_id = p_user_id
      and cache_key = p_cache_key
      and expires_at > rate_limit_now;

    if found then
        insert into private.financial_insight_request_events (user_id, ip_hash, requested_at)
        values (p_user_id, p_ip_hash, rate_limit_now);

        return query select 'cache_hit'::text, 0, null::uuid, cached_value;
        return;
    end if;

    select expires_at
    into active_lock_expires_at
    from private.financial_insight_request_locks
    where user_id = p_user_id;

    if found then
        return query select 'concurrent_request'::text,
            greatest(1, ceil(extract(epoch from active_lock_expires_at - rate_limit_now))::integer),
            null::uuid, null::jsonb;
        return;
    end if;

    new_request_token := gen_random_uuid();
    insert into private.financial_insight_request_locks (
        user_id, request_token, acquired_at, expires_at
    ) values (
        p_user_id, new_request_token, rate_limit_now, rate_limit_now + interval '60 seconds'
    );

    insert into private.financial_insight_request_events (user_id, ip_hash, requested_at)
    values (p_user_id, p_ip_hash, rate_limit_now);

    return query select 'allowed'::text, 0, new_request_token, null::jsonb;
end;
$$;

revoke all on function public.begin_financial_insights_request(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.begin_financial_insights_request(uuid, text, text)
to service_role;
