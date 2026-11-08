-- =====================================================================
--  SCI CLUB TAINO · configurazione del database su Supabase
--  Incolla TUTTO questo testo nel "SQL Editor" del progetto Supabase
--  e premi "Run". Si può rieseguire senza danni.
-- =====================================================================

-- ---------- 1. AMMINISTRATORI ---------------------------------------
create table if not exists public.amministratori (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creato  timestamptz not null default now()
);
alter table public.amministratori enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.amministratori where user_id = auth.uid());
$$;

-- ---------- 2. PROFILI DEI SOCI --------------------------------------
create table if not exists public.profili (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nome         text not null check (char_length(nome) between 1 and 60),
  cognome      text not null check (char_length(cognome) between 1 and 60),
  data_nascita date,
  telefono     text check (telefono is null or char_length(telefono) <= 30),
  email        text,
  privacy      boolean not null default false,
  creato       timestamptz not null default now()
);
alter table public.profili enable row level security;
drop policy if exists "profilo leggi"     on public.profili;
drop policy if exists "profilo crea"      on public.profili;
drop policy if exists "profilo modifica"  on public.profili;
drop policy if exists "profilo elimina"   on public.profili;
create policy "profilo leggi"    on public.profili for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "profilo crea"     on public.profili for insert to authenticated with check (user_id = auth.uid());
create policy "profilo modifica" on public.profili for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "profilo elimina"  on public.profili for delete to authenticated using (public.is_admin());

-- ---------- 3. TESSERAMENTI ANNUALI ----------------------------------
create table if not exists public.tesseramenti (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profili(user_id) on delete cascade,
  richiesto       timestamptz not null default now(),
  data_iscrizione date,
  scadenza        date,
  stato           text not null default 'in_attesa' check (stato in ('in_attesa','attiva','rifiutata')),
  note            text check (note is null or char_length(note) <= 300),
  check (scadenza is null or data_iscrizione is null or scadenza >= data_iscrizione)
);
create unique index if not exists una_richiesta_in_attesa on public.tesseramenti (user_id) where stato = 'in_attesa';
alter table public.tesseramenti enable row level security;
drop policy if exists "tess leggi"    on public.tesseramenti;
drop policy if exists "tess richiedi" on public.tesseramenti;
drop policy if exists "tess modifica" on public.tesseramenti;
drop policy if exists "tess elimina"  on public.tesseramenti;
create policy "tess leggi"    on public.tesseramenti for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "tess richiedi" on public.tesseramenti for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy "tess modifica" on public.tesseramenti for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "tess elimina"  on public.tesseramenti for delete to authenticated using (public.is_admin() or (user_id = auth.uid() and stato = 'in_attesa'));

-- Un socio può solo CHIEDERE l'iscrizione: le date le mette l'amministratore.
create or replace function public.tess_controllo_richiesta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.user_id := auth.uid();
    new.stato := 'in_attesa';
    new.data_iscrizione := null;
    new.scadenza := null;
  end if;
  return new;
end $$;
drop trigger if exists tess_controllo on public.tesseramenti;
create trigger tess_controllo before insert on public.tesseramenti
  for each row execute function public.tess_controllo_richiesta();

create or replace function public.socio_attivo(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tesseramenti
    where user_id = p_user and stato = 'attiva'
      and (now() at time zone 'Europe/Rome')::date between data_iscrizione and scadenza
  );
$$;

-- ---------- 4. EVENTI ------------------------------------------------
create table if not exists public.eventi (
  id            uuid primary key default gen_random_uuid(),
  titolo        text not null check (char_length(titolo) between 1 and 120),
  descrizione   text check (descrizione is null or char_length(descrizione) <= 3000),
  destinazione  text not null,
  dest_lat      double precision,
  dest_lon      double precision,
  ritrovo_luogo text not null,
  ritrovo_lat   double precision,
  ritrovo_lon   double precision,
  ritrovo_entro timestamptz not null,
  partenza      timestamptz not null,
  rientro       timestamptz,
  mezzo         text not null default 'pullman' check (mezzo in ('pullman','auto','minibus')),
  posti         integer not null check (posti between 1 and 1000),
  chiusura      timestamptz not null,
  quota         text check (quota is null or char_length(quota) <= 200),
  sito_info     text,
  solo_soci     boolean not null default true,
  creato        timestamptz not null default now(),
  creato_da     uuid default auth.uid()
);
create index if not exists eventi_partenza_idx on public.eventi (partenza);
alter table public.eventi enable row level security;
drop policy if exists "eventi tutti leggono" on public.eventi;
drop policy if exists "eventi admin crea"    on public.eventi;
drop policy if exists "eventi admin modifica" on public.eventi;
drop policy if exists "eventi admin elimina" on public.eventi;
create policy "eventi tutti leggono"  on public.eventi for select to anon, authenticated using (true);
create policy "eventi admin crea"     on public.eventi for insert to authenticated with check (public.is_admin());
create policy "eventi admin modifica" on public.eventi for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "eventi admin elimina"  on public.eventi for delete to authenticated using (public.is_admin());

-- ---------- 5. ISCRIZIONI AGLI EVENTI --------------------------------
create table if not exists public.iscrizioni (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.eventi(id) on delete cascade,
  user_id    uuid not null references public.profili(user_id) on delete cascade,
  note       text check (note is null or char_length(note) <= 300),
  creato     timestamptz not null default now(),
  unique (evento_id, user_id)
);
alter table public.iscrizioni enable row level security;
drop policy if exists "iscrizioni leggi"   on public.iscrizioni;
drop policy if exists "iscrizioni admin elimina" on public.iscrizioni;
create policy "iscrizioni leggi" on public.iscrizioni for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "iscrizioni admin elimina" on public.iscrizioni for delete to authenticated using (public.is_admin());
-- (i soci si iscrivono e si cancellano solo tramite le funzioni qui sotto, che controllano posti e scadenze)

-- Quanti iscritti ha ogni evento (visibile a tutti, senza nomi)
create or replace function public.conteggi_iscrizioni()
returns table (evento_id uuid, iscritti integer)
language sql stable security definer set search_path = public as $$
  select evento_id, count(*)::int from public.iscrizioni group by evento_id;
$$;

create or replace function public.iscriviti_evento(p_evento uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e public.eventi; n integer;
begin
  if auth.uid() is null then raise exception 'Devi accedere per iscriverti'; end if;
  if not exists (select 1 from public.profili where user_id = auth.uid()) then
    raise exception 'Completa prima i tuoi dati nella sezione Tessera';
  end if;
  select * into e from public.eventi where id = p_evento for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if now() > e.chiusura then raise exception 'Le iscrizioni a questo evento sono chiuse'; end if;
  if e.solo_soci and not public.socio_attivo(auth.uid()) then
    raise exception 'Per questo evento serve il tesseramento attivo';
  end if;
  if exists (select 1 from public.iscrizioni where evento_id = p_evento and user_id = auth.uid()) then
    return;
  end if;
  select count(*) into n from public.iscrizioni where evento_id = p_evento;
  if n >= e.posti then raise exception 'Posti esauriti'; end if;
  insert into public.iscrizioni (evento_id, user_id, note) values (p_evento, auth.uid(), p_note);
end $$;

create or replace function public.annulla_iscrizione(p_evento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.eventi;
begin
  select * into e from public.eventi where id = p_evento;
  if not found then raise exception 'Evento non trovato'; end if;
  if now() > e.chiusura and not public.is_admin() then
    raise exception 'Iscrizioni chiuse: per cancellarti contatta gli organizzatori';
  end if;
  delete from public.iscrizioni where evento_id = p_evento and user_id = auth.uid();
end $$;

-- ---------- 6. GESTIONE AMMINISTRATORI DALL'APP ----------------------
create or replace function public.elenco_admin()
returns table (user_id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo per amministratori'; end if;
  return query select a.user_id, u.email::text from public.amministratori a join auth.users u on u.id = a.user_id order by u.email;
end $$;

create or replace function public.aggiungi_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Solo per amministratori'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'Nessun utente registrato con questa email: deve prima creare un account nell''app'; end if;
  insert into public.amministratori (user_id) values (uid) on conflict do nothing;
end $$;

create or replace function public.rimuovi_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo per amministratori'; end if;
  if p_user = auth.uid() then raise exception 'Non puoi togliere te stesso'; end if;
  delete from public.amministratori where user_id = p_user;
end $$;

-- ---------- 7. PERMESSI SULLE FUNZIONI -------------------------------
revoke all on function public.elenco_admin()            from public, anon;
revoke all on function public.aggiungi_admin(text)      from public, anon;
revoke all on function public.rimuovi_admin(uuid)       from public, anon;
revoke all on function public.iscriviti_evento(uuid, text) from public, anon;
revoke all on function public.annulla_iscrizione(uuid)  from public, anon;
grant execute on function public.is_admin()                to anon, authenticated;
grant execute on function public.conteggi_iscrizioni()     to anon, authenticated;
grant execute on function public.socio_attivo(uuid)        to authenticated;
grant execute on function public.iscriviti_evento(uuid, text) to authenticated;
grant execute on function public.annulla_iscrizione(uuid)  to authenticated;
grant execute on function public.elenco_admin()            to authenticated;
grant execute on function public.aggiungi_admin(text)      to authenticated;
grant execute on function public.rimuovi_admin(uuid)      to authenticated;

-- =====================================================================
--  ULTIMO PASSO (una volta sola, DOPO esserti registrato nell'app):
--  rendi te stesso amministratore. Sostituisci l'email e premi "Run".
--
--  insert into public.amministratori (user_id)
--  select id from auth.users where email = 'LA-TUA-EMAIL@esempio.it';
-- =====================================================================
