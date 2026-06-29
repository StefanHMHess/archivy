-- Entfernt nur fuer public.vertraege die harte Abhaengigkeit zur Tabelle public.vertragsbesitzer.
-- Ziel: Vertragsbesitzer-Verwaltung bleibt erhalten, aber public.vertraege speichert den Owner nur als Textwert aus FileMaker.

begin;

-- 1) Nur FK-Constraint(s) von public.vertraege -> public.vertragsbesitzer entfernen.
do $$
declare
  rec record;
begin
  for rec in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.vertragsbesitzer'::regclass
      and conrelid = 'public.vertraege'::regclass
  loop
    execute format('alter table %s drop constraint if exists %I', rec.table_name, rec.conname);
  end loop;
end $$;

-- 2) Vertrags-Policies zuerst entfernen, damit keine Abhaengigkeit an der Spalte haengt.
drop policy if exists "auth_lesen" on public.vertraege;
drop policy if exists "auth_insert" on public.vertraege;
drop policy if exists "auth_update" on public.vertraege;
drop policy if exists "auth_delete" on public.vertraege;
drop policy if exists "fm_sync_insert" on public.vertraege;
drop policy if exists "fm_sync_update" on public.vertraege;

-- 3) Nur die Vertrags-Owner-Spalte als reines Textfeld belassen.
alter table if exists public.vertraege alter column vertragsbesitzer_id type text;

-- 4) Nur die Vertrags-RLS von der Owner-Tabelle entkoppeln.
create policy "auth_lesen"  on public.vertraege for select to authenticated using (true);
create policy "auth_insert" on public.vertraege for insert to authenticated with check (true);
create policy "auth_update" on public.vertraege for update to authenticated using (true) with check (true);
create policy "auth_delete" on public.vertraege for delete to authenticated using (true);

-- 5) FileMaker-Sync fuer vertraege bleibt nur gegen leere Owner abgesichert.
create policy "fm_sync_insert" on public.vertraege for insert to anon with check (vertragsbesitzer_id is not null and vertragsbesitzer_id <> '');
create policy "fm_sync_update" on public.vertraege for update to anon using (vertragsbesitzer_id is not null and vertragsbesitzer_id <> '');

commit;

-- Die Tabelle public.vertragsbesitzer bleibt bestehen.
