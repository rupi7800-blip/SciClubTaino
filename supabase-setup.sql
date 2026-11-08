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

-- ---------- 8. CORSO DI SCI (Pila) -----------------------------------
create table if not exists public.corsi (
  id            uuid primary key default gen_random_uuid(),
  titolo        text not null check (char_length(titolo) between 1 and 120),
  stagione      text,
  localita      text not null default 'Pila (AO)',
  dest_lat      double precision,
  dest_lon      double precision,
  descrizione   text check (descrizione is null or char_length(descrizione) <= 6000),
  date_lezioni  date[] not null default '{}',
  ritrovo_luogo text not null default 'Taino (VA)',
  ritrovo_lat   double precision,
  ritrovo_lon   double precision,
  ora_ritrovo   time not null default '05:45',
  ora_partenza  time not null default '06:00',
  ora_rientro   time,
  mezzo         text not null default 'pullman' check (mezzo in ('pullman','auto','minibus')),
  posti         integer not null default 100 check (posti between 1 and 1000),
  apertura      timestamptz,
  chiusura      timestamptz not null,
  quota         text check (quota is null or char_length(quota) <= 300),
  sito_info     text,
  solo_soci     boolean not null default true,
  creato        timestamptz not null default now()
);
alter table public.corsi enable row level security;
drop policy if exists "corsi tutti leggono"   on public.corsi;
drop policy if exists "corsi admin crea"      on public.corsi;
drop policy if exists "corsi admin modifica"  on public.corsi;
drop policy if exists "corsi admin elimina"   on public.corsi;
create policy "corsi tutti leggono"  on public.corsi for select to anon, authenticated using (true);
create policy "corsi admin crea"     on public.corsi for insert to authenticated with check (public.is_admin());
create policy "corsi admin modifica" on public.corsi for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "corsi admin elimina"  on public.corsi for delete to authenticated using (public.is_admin());

create table if not exists public.iscrizioni_corso (
  id                uuid primary key default gen_random_uuid(),
  corso_id          uuid not null references public.corsi(id) on delete cascade,
  user_id           uuid not null references public.profili(user_id) on delete cascade,
  part_nome         text not null check (char_length(part_nome) between 1 and 60),
  part_cognome      text not null check (char_length(part_cognome) between 1 and 60),
  part_nascita      date,
  per_me            boolean not null default true,
  livello           integer not null check (livello between 1 and 6),
  livello_suggerito integer check (livello_suggerito is null or livello_suggerito between 1 and 6),
  risposte          jsonb,
  note              text check (note is null or char_length(note) <= 500),
  creato            timestamptz not null default now()
);
create unique index if not exists iscr_corso_unica on public.iscrizioni_corso (corso_id, lower(part_nome), lower(part_cognome), part_nascita);
alter table public.iscrizioni_corso enable row level security;
drop policy if exists "iscr corso leggi"          on public.iscrizioni_corso;
drop policy if exists "iscr corso admin modifica" on public.iscrizioni_corso;
create policy "iscr corso leggi" on public.iscrizioni_corso for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "iscr corso admin modifica" on public.iscrizioni_corso for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.conteggi_corso()
returns table (corso_id uuid, iscritti integer)
language sql stable security definer set search_path = public as $$
  select corso_id, count(*)::int from public.iscrizioni_corso group by corso_id;
$$;

create or replace function public.iscriviti_corso(
  p_corso uuid, p_nome text, p_cognome text, p_nascita date, p_per_me boolean,
  p_livello integer, p_suggerito integer default null, p_risposte jsonb default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.corsi; n integer; mie integer;
begin
  if auth.uid() is null then raise exception 'Devi accedere per iscriverti'; end if;
  if not exists (select 1 from public.profili where user_id = auth.uid()) then
    raise exception 'Completa prima i tuoi dati nella sezione Tessera';
  end if;
  select * into c from public.corsi where id = p_corso for update;
  if not found then raise exception 'Corso non trovato'; end if;
  if c.apertura is not null and now() < c.apertura then raise exception 'Le iscrizioni al corso non sono ancora aperte'; end if;
  if now() > c.chiusura then raise exception 'Le iscrizioni al corso sono chiuse'; end if;
  if c.solo_soci and not public.socio_attivo(auth.uid()) then
    raise exception 'Per iscriverti al corso serve il tesseramento attivo';
  end if;
  if p_livello is null or p_livello not between 1 and 6 then raise exception 'Scegli il livello'; end if;
  select count(*) into mie from public.iscrizioni_corso where corso_id = p_corso and user_id = auth.uid();
  if mie >= 6 then raise exception 'Puoi iscrivere al massimo 6 persone dal tuo account'; end if;
  select count(*) into n from public.iscrizioni_corso where corso_id = p_corso;
  if n >= c.posti then raise exception 'Posti esauriti'; end if;
  insert into public.iscrizioni_corso (corso_id, user_id, part_nome, part_cognome, part_nascita, per_me, livello, livello_suggerito, risposte, note)
  values (p_corso, auth.uid(), trim(p_nome), trim(p_cognome), p_nascita, coalesce(p_per_me, true), p_livello, p_suggerito, p_risposte, nullif(trim(p_note), ''));
exception when unique_violation then
  raise exception 'Questa persona è già iscritta al corso';
end $$;

create or replace function public.annulla_iscrizione_corso(p_iscrizione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.iscrizioni_corso; c public.corsi;
begin
  select * into i from public.iscrizioni_corso where id = p_iscrizione;
  if not found then raise exception 'Iscrizione non trovata'; end if;
  if public.is_admin() then delete from public.iscrizioni_corso where id = p_iscrizione; return; end if;
  if i.user_id <> auth.uid() then raise exception 'Operazione non permessa'; end if;
  select * into c from public.corsi where id = i.corso_id;
  if now() > c.chiusura then raise exception 'Iscrizioni chiuse: per cancellarti contatta gli organizzatori'; end if;
  delete from public.iscrizioni_corso where id = p_iscrizione;
end $$;

revoke all on function public.iscriviti_corso(uuid, text, text, date, boolean, integer, integer, jsonb, text) from public, anon;
revoke all on function public.annulla_iscrizione_corso(uuid) from public, anon;
grant execute on function public.conteggi_corso() to anon, authenticated;
grant execute on function public.iscriviti_corso(uuid, text, text, date, boolean, integer, integer, jsonb, text) to authenticated;
grant execute on function public.annulla_iscrizione_corso(uuid) to authenticated;

-- =====================================================================
--  ULTIMO PASSO (una volta sola, DOPO esserti registrato nell'app):
--  rendi te stesso amministratore. Sostituisci l'email e premi "Run".
--
--  insert into public.amministratori (user_id)
--  select id from auth.users where email = 'LA-TUA-EMAIL@esempio.it';
-- =====================================================================
