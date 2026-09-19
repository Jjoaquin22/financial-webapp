-- Add threshold-aware budget alerts and saving-goal progress notifications.

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
    is_old_savings_contribution boolean := false;
    is_new_savings_contribution boolean := false;
begin
    if tg_op = 'UPDATE' and to_jsonb(new) is not distinct from to_jsonb(old) then return new; end if;

    if tg_table_name = 'transactions' then
        if tg_op <> 'INSERT' then
            is_old_savings_contribution := old.type = 'transfer' and old.saving_goal_id is not null;
        end if;
        if tg_op <> 'DELETE' then
            is_new_savings_contribution := new.type = 'transfer' and new.saving_goal_id is not null;
        end if;

        -- A dedicated trigger creates the richer progress notification. Keep a
        -- transaction notification only when a row changes into or out of savings.
        if (tg_op = 'INSERT' and is_new_savings_contribution)
            or (tg_op = 'DELETE' and is_old_savings_contribution)
            or (tg_op = 'UPDATE' and is_old_savings_contribution and is_new_savings_contribution) then
            if tg_op = 'DELETE' then return old; end if;
            return new;
        end if;
    end if;

    action_label := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'removed' end;

    if tg_table_name = 'transactions' then
        if tg_op = 'DELETE' then
            activity_user_id := old.user_id;
            activity_related_id := old.id;
            activity_metadata := jsonb_build_object('operation', tg_op, 'amount', old.amount, 'type', old.type);
            activity_type := case when old.type = 'expense' then 'expense_alert' else 'system' end;
            activity_title := initcap(old.type) || ' transaction removed';
            activity_message := 'A PHP ' || round(old.amount::numeric, 2)::text || ' ' || old.type || ' transaction was removed.';
        else
            activity_user_id := new.user_id;
            activity_related_id := new.id;
            activity_metadata := jsonb_build_object('operation', tg_op, 'amount', new.amount, 'type', new.type);
            activity_type := case when new.type = 'expense' then 'expense_alert' else 'system' end;
            activity_title := initcap(new.type) || ' transaction ' || action_label;
            activity_message := 'A PHP ' || round(new.amount::numeric, 2)::text || ' ' || new.type || ' transaction was ' || action_label || '.';
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

create or replace function public.create_budget_status_notification()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    impacted_budget_ids uuid[] := array[]::uuid[];
    budget_record public.budget_management%rowtype;
    impacted_budget_id uuid;
    current_spent numeric;
    previous_spent numeric;
    current_percentage numeric;
    previous_percentage numeric;
    status_title text;
    status_message text;
    status_priority text;
begin
    if tg_table_name = 'transactions' then
        if tg_op = 'INSERT' then
            if new.type <> 'expense' or new.category_id is null then return new; end if;
            select coalesce(array_agg(b.budget_id), array[]::uuid[]) into impacted_budget_ids
            from public.budget_management b
            where b.user_id = new.user_id
              and b.category_id = new.category_id
              and (b.start_date is null or new.transaction_date::date >= b.start_date)
              and (b.end_date is null or new.transaction_date::date <= b.end_date);
        elsif tg_op = 'DELETE' then
            if old.type <> 'expense' or old.category_id is null then return old; end if;
            select coalesce(array_agg(b.budget_id), array[]::uuid[]) into impacted_budget_ids
            from public.budget_management b
            where b.user_id = old.user_id
              and b.category_id = old.category_id
              and (b.start_date is null or old.transaction_date::date >= b.start_date)
              and (b.end_date is null or old.transaction_date::date <= b.end_date);
        else
            select coalesce(array_agg(distinct b.budget_id), array[]::uuid[]) into impacted_budget_ids
            from public.budget_management b
            where (new.type = 'expense'
                   and new.category_id is not null
                   and b.user_id = new.user_id
                   and b.category_id = new.category_id
                   and (b.start_date is null or new.transaction_date::date >= b.start_date)
                   and (b.end_date is null or new.transaction_date::date <= b.end_date))
               or (old.type = 'expense'
                   and old.category_id is not null
                   and b.user_id = old.user_id
                   and b.category_id = old.category_id
                   and (b.start_date is null or old.transaction_date::date >= b.start_date)
                   and (b.end_date is null or old.transaction_date::date <= b.end_date));
        end if;

        foreach impacted_budget_id in array impacted_budget_ids loop
            select * into budget_record
            from public.budget_management
            where budget_id = impacted_budget_id;

            if budget_record.budget is null or budget_record.budget <= 0 then continue; end if;

            select coalesce(sum(t.amount), 0) into current_spent
            from public.transactions t
            where t.user_id = budget_record.user_id
              and t.type = 'expense'
              and t.category_id = budget_record.category_id
              and (budget_record.start_date is null or t.transaction_date::date >= budget_record.start_date)
              and (budget_record.end_date is null or t.transaction_date::date <= budget_record.end_date);

            previous_spent := current_spent;
            if tg_op <> 'DELETE'
               and new.type = 'expense'
               and new.user_id = budget_record.user_id
               and new.category_id = budget_record.category_id
               and (budget_record.start_date is null or new.transaction_date::date >= budget_record.start_date)
               and (budget_record.end_date is null or new.transaction_date::date <= budget_record.end_date) then
                previous_spent := previous_spent - new.amount;
            end if;
            if tg_op <> 'INSERT'
               and old.type = 'expense'
               and old.user_id = budget_record.user_id
               and old.category_id = budget_record.category_id
               and (budget_record.start_date is null or old.transaction_date::date >= budget_record.start_date)
               and (budget_record.end_date is null or old.transaction_date::date <= budget_record.end_date) then
                previous_spent := previous_spent + old.amount;
            end if;

            current_percentage := current_spent / budget_record.budget * 100;
            previous_percentage := previous_spent / budget_record.budget * 100;

            status_title := null;
            if current_percentage >= 100 and previous_percentage < 100 then
                status_title := 'Budget limit exceeded';
                status_priority := 'urgent';
                status_message := coalesce(budget_record.category, 'Your') || ' budget is ' || round(current_percentage, 1)::text
                    || '% used. PHP ' || round(current_spent, 2)::text || ' spent of PHP ' || round(budget_record.budget, 2)::text
                    || '; PHP ' || round(current_spent - budget_record.budget, 2)::text || ' over the limit.';
            elsif current_percentage >= 80 and previous_percentage < 80 then
                status_title := 'Budget near its limit';
                status_priority := 'high';
                status_message := coalesce(budget_record.category, 'Your') || ' budget is ' || round(current_percentage, 1)::text
                    || '% used. PHP ' || round(current_spent, 2)::text || ' spent of PHP ' || round(budget_record.budget, 2)::text
                    || '; PHP ' || round(greatest(budget_record.budget - current_spent, 0), 2)::text || ' remaining.';
            end if;

            if status_title is not null then
                insert into public.notifications (user_id, notification_type, title, message, priority, related_record_id, related_type, metadata)
                values (
                    budget_record.user_id, 'budget_alert', status_title, status_message, status_priority,
                    budget_record.budget_id::text, 'budget',
                    jsonb_build_object('budget_id', budget_record.budget_id, 'spent_amount', current_spent,
                        'budget_amount', budget_record.budget, 'percentage_used', round(current_percentage, 1),
                        'status', case when current_percentage >= 100 then 'exceeded' else 'near_limit' end)
                );
            end if;
        end loop;

        if tg_op = 'DELETE' then return old; end if;
        return new;
    end if;

    if tg_table_name = 'budget_management' then
        if tg_op = 'DELETE' or new.budget is null or new.budget <= 0 then
            if tg_op = 'DELETE' then return old; end if;
            return new;
        end if;

        select coalesce(sum(t.amount), 0) into current_spent
        from public.transactions t
        where t.user_id = new.user_id
          and t.type = 'expense'
          and t.category_id = new.category_id
          and (new.start_date is null or t.transaction_date::date >= new.start_date)
          and (new.end_date is null or t.transaction_date::date <= new.end_date);
        current_percentage := current_spent / new.budget * 100;

        if tg_op = 'INSERT' or old.budget is null or old.budget <= 0 then
            previous_percentage := 0;
        else
            select coalesce(sum(t.amount), 0) into previous_spent
            from public.transactions t
            where t.user_id = old.user_id
              and t.type = 'expense'
              and t.category_id = old.category_id
              and (old.start_date is null or t.transaction_date::date >= old.start_date)
              and (old.end_date is null or t.transaction_date::date <= old.end_date);
            previous_percentage := previous_spent / old.budget * 100;
        end if;

        status_title := null;
        if current_percentage >= 100 and previous_percentage < 100 then
            status_title := 'Budget limit exceeded'; status_priority := 'urgent';
            status_message := coalesce(new.category, 'Your') || ' budget is ' || round(current_percentage, 1)::text
                || '% used. PHP ' || round(current_spent, 2)::text || ' spent of PHP ' || round(new.budget, 2)::text
                || '; PHP ' || round(current_spent - new.budget, 2)::text || ' over the limit.';
        elsif current_percentage >= 80 and previous_percentage < 80 then
            status_title := 'Budget near its limit'; status_priority := 'high';
            status_message := coalesce(new.category, 'Your') || ' budget is ' || round(current_percentage, 1)::text
                || '% used. PHP ' || round(current_spent, 2)::text || ' spent of PHP ' || round(new.budget, 2)::text
                || '; PHP ' || round(greatest(new.budget - current_spent, 0), 2)::text || ' remaining.';
        end if;

        if status_title is not null then
            insert into public.notifications (user_id, notification_type, title, message, priority, related_record_id, related_type, metadata)
            values (
                new.user_id, 'budget_alert', status_title, status_message, status_priority,
                new.budget_id::text, 'budget',
                jsonb_build_object('budget_id', new.budget_id, 'spent_amount', current_spent,
                    'budget_amount', new.budget, 'percentage_used', round(current_percentage, 1),
                    'status', case when current_percentage >= 100 then 'exceeded' else 'near_limit' end)
            );
        end if;
        return new;
    end if;

    raise exception 'Unsupported budget status table: %', tg_table_name;
end;
$$;

revoke execute on function public.create_budget_status_notification() from public, anon, authenticated;

create or replace function public.create_savings_progress_notification()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    impacted_goal_ids bigint[] := array[]::bigint[];
    goal_record public.saving_goals%rowtype;
    goal_id bigint;
    current_saved numeric;
    previous_saved numeric;
    current_percentage numeric;
    progress_title text;
    progress_message text;
    progress_priority text;
begin
    if tg_op = 'INSERT' then
        if new.type <> 'transfer' or new.saving_goal_id is null then return new; end if;
        impacted_goal_ids := array[new.saving_goal_id];
    elsif tg_op = 'DELETE' then
        if old.type <> 'transfer' or old.saving_goal_id is null then return old; end if;
        impacted_goal_ids := array[old.saving_goal_id];
    else
        select coalesce(array_agg(distinct value), array[]::bigint[]) into impacted_goal_ids
        from unnest(array[
            case when old.type = 'transfer' then old.saving_goal_id end,
            case when new.type = 'transfer' then new.saving_goal_id end
        ]) as impacted(value)
        where value is not null;
    end if;

    foreach goal_id in array impacted_goal_ids loop
        select * into goal_record from public.saving_goals where savings_id = goal_id;
        if not found or goal_record.target_amount is null or goal_record.target_amount <= 0 then continue; end if;

        select coalesce(sum(t.amount), 0) into current_saved
        from public.transactions t
        where t.user_id = goal_record.user_id
          and t.type = 'transfer'
          and t.saving_goal_id = goal_record.savings_id;

        previous_saved := current_saved;
        if tg_op <> 'DELETE' and new.type = 'transfer' and new.saving_goal_id = goal_record.savings_id then
            previous_saved := previous_saved - new.amount;
        end if;
        if tg_op <> 'INSERT' and old.type = 'transfer' and old.saving_goal_id = goal_record.savings_id then
            previous_saved := previous_saved + old.amount;
        end if;

        if current_saved is not distinct from previous_saved then continue; end if;

        current_percentage := current_saved / goal_record.target_amount * 100;
        if current_saved >= goal_record.target_amount and previous_saved < goal_record.target_amount then
            progress_title := 'Saving goal reached'; progress_priority := 'high';
        elsif current_saved > previous_saved then
            progress_title := 'Savings progress updated'; progress_priority := 'normal';
        else
            progress_title := 'Savings progress adjusted'; progress_priority := 'normal';
        end if;

        progress_message := coalesce(goal_record.goal_name, 'Saving goal') || ': PHP ' || round(current_saved, 2)::text
            || ' of PHP ' || round(goal_record.target_amount, 2)::text || ' saved (' || round(current_percentage, 1)::text
            || '%). PHP ' || round(greatest(goal_record.target_amount - current_saved, 0), 2)::text || ' remaining.';

        insert into public.notifications (user_id, notification_type, title, message, priority, related_record_id, related_type, metadata)
        values (
            goal_record.user_id, 'savings_milestone', progress_title, progress_message, progress_priority,
            goal_record.savings_id::text, 'saving_goal',
            jsonb_build_object('savings_id', goal_record.savings_id, 'saved_amount', current_saved,
                'target_amount', goal_record.target_amount, 'percentage_completed', round(current_percentage, 1),
                'remaining_amount', greatest(goal_record.target_amount - current_saved, 0))
        );
    end loop;

    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

revoke execute on function public.create_savings_progress_notification() from public, anon, authenticated;

create index if not exists budget_management_user_category_dates_idx
on public.budget_management (user_id, category_id, start_date, end_date);

drop trigger if exists notify_budget_status_from_activity on public.transactions;
create trigger notify_budget_status_from_activity
after insert or update or delete on public.transactions
for each row execute function public.create_budget_status_notification();

drop trigger if exists notify_budget_status_from_budget on public.budget_management;
create trigger notify_budget_status_from_budget
after insert or update on public.budget_management
for each row execute function public.create_budget_status_notification();

drop trigger if exists notify_savings_progress on public.transactions;
create trigger notify_savings_progress
after insert or update or delete on public.transactions
for each row execute function public.create_savings_progress_notification();
