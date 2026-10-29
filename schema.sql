-- MY ESPACE — sincronização privada entre dispositivos
-- Execute este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- Autenticação: Supabase Auth. Conteúdo do espaço: user_workspace (JSONB).
-- Binários de arquivos: Storage privado no bucket user-files.

create table if not exists public.user_workspace (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_workspace enable row level security;

drop policy if exists "My espace users can read own workspace" on public.user_workspace;
create policy "My espace users can read own workspace"
on public.user_workspace for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "My espace users can create own workspace" on public.user_workspace;
create policy "My espace users can create own workspace"
on public.user_workspace for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "My espace users can update own workspace" on public.user_workspace;
create policy "My espace users can update own workspace"
on public.user_workspace for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "My espace users can delete own workspace" on public.user_workspace;
create policy "My espace users can delete own workspace"
on public.user_workspace for delete to authenticated
using ((select auth.uid()) = user_id);

-- Bucket privado com limite de 50 MiB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "My espace users can read own stored files" on storage.objects;
create policy "My espace users can read own stored files"
on storage.objects for select to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "My espace users can upload own stored files" on storage.objects;
create policy "My espace users can upload own stored files"
on storage.objects for insert to authenticated
with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "My espace users can update own stored files" on storage.objects;
create policy "My espace users can update own stored files"
on storage.objects for update to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "My espace users can delete own stored files" on storage.objects;
create policy "My espace users can delete own stored files"
on storage.objects for delete to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Liga o realtime da tabela para que outros aparelhos recebam atualizações.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'user_workspace'
     ) then
    alter publication supabase_realtime add table public.user_workspace;
  end if;
end $$;
