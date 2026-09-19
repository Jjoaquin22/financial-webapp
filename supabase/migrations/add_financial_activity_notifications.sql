-- The notifications table is part of the live schema and generated client types.
-- This migration secures it, publishes it to Realtime, and records financial activity.

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon, authenticated;
grant select, insert on table public.notifications to authenticated;
grant update (is_read, read_at) on table public.notifications to authenticated;

do $policy_cleanup$
declare
    existing_policy record;
begin
    for existing_policy in
        select policyname from pg_policies where schemaname = 'public' and tablename = 'notifications'
    loop
        execute format('drop policy %I on public.notifications', existing_policy.policyname);
    end loop;
end
$policy_cleanup$;

create policy "Users can view their own notifications" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own notifications" on public.notifications for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can mark their own notifications as read" on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists notifications_user_created_at_idx on public.notifications (user_id, created_at desc);

create or replace function public.create_financial_activity_notification()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    activity_user_id uuid;
    activity_title text;
    activity_message text;
    activity_type text;
    activity_related_type text;
    activity_related_id text;
    activity_metadata jsonb := '{}'::jsonb;
    action_label text;
begin
    if tg_op = 'UPDATE' and to_jsonb(new) is not distinct from to_jsonb(old) then return new; end if;
    action_label := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'removed' end;

    if tg_table_name = 'transactions' then
        if tg_op = 'DELETE' then
            activity_user_id := old.user_id;
            activity_related_id := old.id;
            activity_metadata := jsonb_build_object('operation', tg_op, 'amount', old.amount, 'type', old.type);
            if old.type = 'transfer' and old.saving_goal_id is not null then
                activity_type := 'savings_milestone'; activity_title := 'Savings contribution removed';
                activity_message := 'A PHP ' || round(old.amount::numeric, 2)::text || ' savings contribution was removed.';
            else
                activity_type := case when old.type = 'expense' then 'expense_alert' else 'system' end;
                activity_title := initcap(old.type) || ' transaction removed';
                activity_message := 'A PHP ' || round(old.amount::numeric, 2)::text || ' ' || old.type || ' transaction was removed.';
            end if;
        else
            activity_user_id := new.user_id;
            activity_related_id := new.id;
            activity_metadata := jsonb_build_object('operation', tg_op, 'amount', new.amount, 'type', new.type);
            if new.type = 'transfer' and new.saving_goal_id is not null then
                activity_type := 'savings_milestone';
                activity_title := case tg_op when 'INSERT' then 'Savings contribution recorded' else 'Savings contribution updated' end;
                activity_message := 'PHP ' || round(new.amount::numeric, 2)::text || ' was ' || case tg_op when 'INSERT' then 'added to' else 'updated in' end || ' a saving goal.';
            else
                activity_type := case when new.type = 'expense' then 'expense_alert' else 'system' end;
                activity_title := initcap(new.type) || ' transaction ' || action_label;
                activity_message := 'A PHP ' || round(new.amount::numeric, 2)::text || ' ' || new.type || ' transaction was ' || action_label || '.';
            end if;
        end if;
        activity_related_type := 'transaction';
    elsif tg_table_name = 'budget_management' then
        if tg_op = 'DELETE' then
            activity_user_id := old.user_id; activity_related_id := old.budget_id; activity_title := 'Budget removed';
            activity_message := 'The ' || coalesce(old.category, 'selected') || ' budget was removed.';
            activity_metadata := jsonb_build_object('operation', tg_op, 'budget', old.budget, 'category', old.category);
        else
            activity_user_id := new.user_id; activity_related_id := new.budget_id; activity_title := 'Budget ' || action_label;
            activity_message := 'The ' || coalesce(new.category, 'selected') || ' budget is now PHP ' || round(coalesce(new.budget, 0)::numeric, 2)::text || '.';
            activity_metadata := jsonb_build_object('operation', tg_op, 'budget', new.budget, 'category', new.category);
        end if;
        activity_type := 'budget_alert'; activity_related_type := 'budget';
    elsif tg_table_name = 'saving_goals' then
        if tg_op = 'DELETE' then
            activity_user_id := old.user_id; activity_title := 'Saving goal removed';
            activity_message := 'The ' || coalesce(old.goal_name, 'selected') || ' saving goal was removed.';
            activity_metadata := jsonb_build_object('operation', tg_op, 'savings_id', old.savings_id, 'target_amount', old.target_amount);
        else
            activity_user_id := new.user_id; activity_title := 'Saving goal ' || action_label;
            activity_message := 'The target for ' || coalesce(new.goal_name, 'your saving goal') || ' is PHP ' || round(coalesce(new.target_amount, 0)::numeric, 2)::text || '.';
            activity_metadata := jsonb_build_object('operation', tg_op, 'savings_id', new.savings_id, 'target_amount', new.target_amount);
        end if;
        activity_type := 'savings_milestone'; activity_related_type := 'saving_goal'; activity_related_id := null;
    else
        raise exception 'Unsupported financial activity table: %', tg_table_name;
    end if;

    insert into public.notifications (user_id, notification_type, title, message, priority, related_record_id, related_type, metadata)
    values (activity_user_id, activity_type, activity_title, activity_message, 'normal', activity_related_id, activity_related_type, activity_metadata);

    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

revoke execute on function public.create_financial_activity_notification() from public, anon, authenticated;

drop trigger if exists notify_transaction_activity on public.transactions;
create trigger notify_transaction_activity after insert or update or delete on public.transactions for each row execute function public.create_financial_activity_notification();
drop trigger if exists notify_budget_activity on public.budget_management;
create trigger notify_budget_activity after insert or update or delete on public.budget_management for each row execute function public.create_financial_activity_notification();
drop trigger if exists notify_saving_goal_activity on public.saving_goals;
create trigger notify_saving_goal_activity after insert or update or delete on public.saving_goals for each row execute function public.create_financial_activity_notification();

do $$
begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
        alter publication supabase_realtime add table public.notifications;
    end if;
end
$$;
