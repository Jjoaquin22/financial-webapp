create or replace function public.begin_ai_chat_request(
    p_user_id uuid,
    p_ip_hash text
)
returns table (
    decision text,
    retry_after_seconds integer,
    request_token uuid
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
    new_request_token uuid;
begin
    if p_user_id is null then
        raise exception 'A user ID is required.' using errcode = '22023';
    end if;
    if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'A valid IP hash is required.' using errcode = '22023';
    end if;

    -- Serialize only this user's check so users sharing an IP do not share quota.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('ai-chat:user:' || p_user_id::text, 0)
    );

    delete from private.ai_chat_request_events
    where requested_at <= rate_limit_now - interval '24 hours';

    delete from private.ai_chat_request_locks
    where expires_at <= rate_limit_now;

    select count(*)::integer, min(requested_at)
    into event_count, oldest_event
    from private.ai_chat_request_events
    where user_id = p_user_id
      and requested_at > rate_limit_now - interval '1 minute';

    if event_count >= 10 then
        return query select 'rate_limited'::text,
            greatest(
                1,
                ceil(extract(epoch from oldest_event + interval '1 minute' - rate_limit_now))::integer
            ),
            null::uuid;
        return;
    end if;

    select expires_at
    into active_lock_expires_at
    from private.ai_chat_request_locks
    where user_id = p_user_id;

    if found then
        return query select 'concurrent_request'::text,
            greatest(
                1,
                ceil(extract(epoch from active_lock_expires_at - rate_limit_now))::integer
            ),
            null::uuid;
        return;
    end if;

    new_request_token := gen_random_uuid();

    insert into private.ai_chat_request_locks (
        user_id, request_token, acquired_at, expires_at
    ) values (
        p_user_id, new_request_token, rate_limit_now, rate_limit_now + interval '45 seconds'
    );

    insert into private.ai_chat_request_events (user_id, ip_hash, requested_at)
    values (p_user_id, p_ip_hash, rate_limit_now);

    return query select 'allowed'::text, 0, new_request_token;
end;
$$;

revoke all on function public.begin_ai_chat_request(uuid, text)
from public, anon, authenticated;

grant execute on function public.begin_ai_chat_request(uuid, text)
to service_role;

comment on function public.begin_ai_chat_request(uuid, text) is
'Atomically enforces 10 AI chatbot requests per rolling minute for each authenticated user and one active request per user.';
