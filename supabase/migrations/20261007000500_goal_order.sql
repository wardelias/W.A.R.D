-- Reorders the user's goal ladder in one statement. The unique rank
-- constraint is deferred inside the transaction so ranks can swap.
create function public.reorder_goals(p_ids uuid[]) returns void
language plpgsql
set search_path = ''
as $$
begin
  if cardinality(p_ids) <> 3
     or (select count(*) from public.goals where user_id = (select auth.uid()) and id = any (p_ids)) <> 3 then
    raise exception 'reorder_goals: pass exactly your three goals' using errcode = '22023';
  end if;
  set constraints public.goals_rank_key deferred;
  update public.goals as g
     set rank = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where g.id = x.id
     and g.user_id = (select auth.uid());
end;
$$;

revoke execute on function public.reorder_goals(uuid[]) from public, anon;
grant execute on function public.reorder_goals(uuid[]) to authenticated;
