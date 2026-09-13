create table public.world_map_current (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 1,
  width integer not null check (width between 2 and 1025),
  height integer not null check (height between 2 and 1025),
  encoding text not null default 'u8-base64' check (encoding = 'u8-base64'),
  data text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create table public.world_map_versions (
  version bigint generated always as identity primary key,
  width integer not null check (width between 2 and 1025),
  height integer not null check (height between 2 and 1025),
  encoding text not null default 'u8-base64' check (encoding = 'u8-base64'),
  data text not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);

create table public.world_map_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.world_map_current enable row level security;
alter table public.world_map_versions enable row level security;
alter table public.world_map_editors enable row level security;

create policy "public can read canonical world map"
on public.world_map_current
for select
to anon, authenticated
using (id = 1);

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

  if p_data is null or length(p_data) < 4 or length(p_data) > 2000000 then
    raise exception 'invalid world map payload';
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

revoke all on function public.publish_world_map(integer, integer, text) from public;
grant execute on function public.publish_world_map(integer, integer, text) to authenticated;
