revoke execute on function public.publish_world_map(integer, integer, text) from anon;
revoke execute on function public.is_world_map_editor() from anon;

grant select on table public.world_map_editors to authenticated;
grant select on table public.world_map_versions to authenticated;

create policy "editor can read own membership"
on public.world_map_editors
for select
to authenticated
using (user_id = auth.uid());

create policy "editors can read world map versions"
on public.world_map_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.world_map_editors editor
    where editor.user_id = auth.uid()
  )
);

create or replace function public.is_world_map_editor()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.world_map_editors
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_world_map_editor() from public;
revoke execute on function public.is_world_map_editor() from anon;
grant execute on function public.is_world_map_editor() to authenticated;
