-- Proyectos compartidos: una copia que editan todas las personas invitadas.
-- Quien comparte conserva su proyecto original y trae los cambios cuando quiere.

create table if not exists public.shares (
  id text primary key,                                   -- código del enlace de invitación
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  nombre text not null default '',
  origen text,                                           -- id del proyecto original de quien lo compartió
  mapa jsonb not null default '{}'::jsonb,               -- id original -> id en la copia compartida
  created_at timestamptz not null default now()
);

create table if not exists public.share_members (
  share_id text not null references public.shares on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

create table if not exists public.share_docs (
  share_id text not null references public.shares on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (share_id, col, id)
);

-- ¿Soy miembro de esta copia compartida?
create or replace function public.is_member(s text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from share_members where share_id = s and user_id = auth.uid());
$$;

-- Unirse con el código del enlace
create or replace function public.join_share(code text) returns text
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  select nombre into n from shares where id = code;
  if n is null then raise exception 'no existe'; end if;
  insert into share_members (share_id, user_id) values (code, auth.uid()) on conflict do nothing;
  return n;
end $$;
revoke all on function public.join_share(text) from public;
grant execute on function public.join_share(text) to authenticated;

alter table public.shares enable row level security;
alter table public.share_members enable row level security;
alter table public.share_docs enable row level security;

drop policy if exists "ver compartidos" on public.shares;
drop policy if exists "crear compartidos" on public.shares;
drop policy if exists "cambiar compartidos" on public.shares;
drop policy if exists "borrar compartidos" on public.shares;
create policy "ver compartidos"     on public.shares for select using (owner = auth.uid() or public.is_member(id));
create policy "crear compartidos"   on public.shares for insert with check (owner = auth.uid());
create policy "cambiar compartidos" on public.shares for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "borrar compartidos"  on public.shares for delete using (owner = auth.uid());

drop policy if exists "ver miembros" on public.share_members;
drop policy if exists "apuntarme" on public.share_members;
drop policy if exists "salir" on public.share_members;
create policy "ver miembros" on public.share_members for select using (public.is_member(share_id));
create policy "apuntarme"    on public.share_members for insert with check (user_id = auth.uid() and exists (select 1 from public.shares s where s.id = share_id and s.owner = auth.uid()));
create policy "salir"        on public.share_members for delete using (user_id = auth.uid());

drop policy if exists "ver copia" on public.share_docs;
drop policy if exists "crear en copia" on public.share_docs;
drop policy if exists "cambiar copia" on public.share_docs;
drop policy if exists "borrar de copia" on public.share_docs;
create policy "ver copia"       on public.share_docs for select using (public.is_member(share_id));
create policy "crear en copia"  on public.share_docs for insert with check (public.is_member(share_id));
create policy "cambiar copia"   on public.share_docs for update using (public.is_member(share_id)) with check (public.is_member(share_id));
create policy "borrar de copia" on public.share_docs for delete using (public.is_member(share_id));

do $$ begin
  alter publication supabase_realtime add table public.share_docs;
exception when duplicate_object then null; end $$;
