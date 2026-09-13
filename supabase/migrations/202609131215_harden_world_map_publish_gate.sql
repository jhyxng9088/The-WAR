grant select on table public.world_map_current to anon, authenticated;
revoke insert, update, delete on table public.world_map_current from anon, authenticated;
revoke all on table public.world_map_versions from anon, authenticated;
revoke all on table public.world_map_editors from anon, authenticated;

create or replace function public.publish_world_map(
  p_width integer,
  p_height integer,
  p_data text
)
returns table(version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  next_version bigint;
  published_at timestamptz := now();
  decoded bytea;
begin
  if actor is null then
    raise exception 'authentication required';
  end if;

  if not exists (select 1 from public.world_map_editors where user_id = actor) then
    raise exception 'world map editor permission required';
  end if;

  if p_width < 2 or p_width > 1025 or p_height < 2 or p_height > 1025 then
    raise exception 'invalid world map dimensions';
  end if;

  begin
    decoded := decode(p_data, 'base64');
  exception when others then
    raise exception 'invalid world map base64';
  end;

  if octet_length(decoded) <> p_width * p_height then
    raise exception 'world map payload size mismatch';
  end if;

  insert into public.world_map_versions(width, height, encoding, data, created_by)
  values (p_width, p_height, 'u8-base64', p_data, actor)
  returning world_map_versions.version into next_version;

  insert into public.world_map_current(id, version, width, height, encoding, data, updated_at, updated_by)
  values (1, next_version, p_width, p_height, 'u8-base64', p_data, published_at, actor)
  on conflict (id) do update set
    version = excluded.version,
    width = excluded.width,
    height = excluded.height,
    encoding = excluded.encoding,
    data = excluded.data,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return query select next_version, published_at;
end;
$$;

create or replace function public.is_world_map_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.world_map_editors where user_id = auth.uid());
$$;

revoke all on function public.is_world_map_editor() from public;
grant execute on function public.is_world_map_editor() to authenticated;
