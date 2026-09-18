drop policy if exists "Policy with security definer functions" on public.accounts;
drop policy if exists "Policy with security definer functions" on public.budget_management;

drop policy if exists "Users can manage their own transactions" on public.transactions;

create policy "Users can manage their own transactions"
on public.transactions for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can view their own accounts"
on public.accounts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own accounts"
on public.accounts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own accounts"
on public.accounts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own accounts"
on public.accounts for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their own budgets"
on public.budget_management for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own budgets"
on public.budget_management for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own budgets"
on public.budget_management for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own budgets"
on public.budget_management for delete
to authenticated
using ((select auth.uid()) = user_id);
