-- Leningadministratie: database-inrichting voor Supabase.
-- Uitvoeren in Supabase: SQL Editor > New query > plakken > Run.
--
-- Opzet:
--   gebruikers              wie toegang heeft en met welke rol
--   administratie_versies   elke keer opslaan = een nieuwe regel met de volledige
--                           administratie (JSON). Oude regels blijven bestaan:
--                           dat is de versiegeschiedenis (N-03).
--
-- Beveiliging:
--   - Row Level Security staat aan op beide tabellen.
--   - Lezen kan alleen met een account dat in "gebruikers" staat EN dat met
--     tweestapsverificatie is ingelogd (aal2, eis N-02).
--   - Schrijven kan alleen via de functie opslaan(), alleen voor de rollen
--     beheerder en eigenaar. Bijwerken of verwijderen van versies kan via de
--     app helemaal niet; de geschiedenis is dus niet achteraf aan te passen.
--   - Sinds 2026 maakt Supabase nieuwe tabellen niet meer automatisch
--     bereikbaar via de API; daarom staan hieronder expliciete GRANTs.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table if not exists public.gebruikers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  naam    text not null,
  rol     text not null check (rol in ('beheerder', 'eigenaar', 'lezer'))
);

create table if not exists public.administratie_versies (
  id                   bigint generated always as identity primary key,
  data                 jsonb not null,
  opgeslagen_op        timestamptz not null default now(),
  opgeslagen_door      uuid references auth.users (id),
  opgeslagen_door_naam text
);

alter table public.gebruikers enable row level security;
alter table public.administratie_versies enable row level security;

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------
create or replace function public.mijn_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rol from public.gebruikers where user_id = auth.uid();
$$;

create or replace function public.met_tweestaps()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- ---------------------------------------------------------------------------
-- Policies: alleen lezen via de API
-- ---------------------------------------------------------------------------
drop policy if exists "eigen gebruikersregel lezen" on public.gebruikers;
create policy "eigen gebruikersregel lezen"
  on public.gebruikers for select
  to authenticated
  using (user_id = (select auth.uid()) and (select public.met_tweestaps()));

drop policy if exists "versies lezen" on public.administratie_versies;
create policy "versies lezen"
  on public.administratie_versies for select
  to authenticated
  using ((select public.mijn_rol()) is not null and (select public.met_tweestaps()));

-- Geen insert-, update- of delete-policies: schrijven gaat alleen via opslaan().

-- ---------------------------------------------------------------------------
-- Opslaan met controle op gelijktijdige wijzigingen
-- ---------------------------------------------------------------------------
create or replace function public.opslaan(p_vorige bigint, p_data jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol     text;
  v_naam    text;
  v_laatste bigint;
  v_nieuw   bigint;
begin
  if not public.met_tweestaps() then
    raise exception 'Tweestapsverificatie vereist' using errcode = '42501';
  end if;

  select rol, naam into v_rol, v_naam from public.gebruikers where user_id = auth.uid();
  if v_rol is null or v_rol not in ('beheerder', 'eigenaar') then
    raise exception 'Geen schrijfrechten' using errcode = '42501';
  end if;

  if p_data is null
     or coalesce(jsonb_typeof(p_data -> 'leningen'), '') <> 'array'
     or coalesce(jsonb_typeof(p_data -> 'ontvangsten'), '') <> 'array'
     or coalesce(jsonb_typeof(p_data -> 'leners'), '') <> 'array' then
    raise exception 'Ongeldige gegevens';
  end if;

  -- Eén opslag tegelijk; daarna controleren of niemand ons voor was.
  perform pg_advisory_xact_lock(hashtext('leningadministratie.opslaan'));
  select coalesce(max(id), 0) into v_laatste from public.administratie_versies;
  if v_laatste <> coalesce(p_vorige, 0) then
    raise exception 'conflict: er is intussen een nieuwere versie opgeslagen';
  end if;

  insert into public.administratie_versies (data, opgeslagen_door, opgeslagen_door_naam)
  values (p_data, auth.uid(), v_naam)
  returning id into v_nieuw;

  return v_nieuw;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechten (expliciet, ook voor projecten van na de wijziging van mei 2026)
-- ---------------------------------------------------------------------------
revoke all on public.gebruikers from anon, authenticated;
revoke all on public.administratie_versies from anon, authenticated;
grant select on public.gebruikers to authenticated;
grant select on public.administratie_versies to authenticated;

revoke all on function public.opslaan(bigint, jsonb) from public, anon;
revoke all on function public.mijn_rol() from public, anon;
revoke all on function public.met_tweestaps() from public, anon;
grant execute on function public.opslaan(bigint, jsonb) to authenticated;
grant execute on function public.mijn_rol() to authenticated;
grant execute on function public.met_tweestaps() to authenticated;

-- ---------------------------------------------------------------------------
-- Wakker houden: een onschuldige functie die de dagelijkse GitHub Action
-- aanroept, zodat een gratis Supabase-project niet pauzeert. Geeft alleen het
-- getal 1 terug en raakt geen gegevens.
-- ---------------------------------------------------------------------------
create or replace function public.ping()
returns integer
language sql
stable
set search_path = ''
as $$
  select 1;
$$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gebruikers toevoegen (pas de e-mailadressen aan en voer los uit, NADAT de
-- accounts zijn aangemaakt onder Authentication > Users > Invite user):
--
-- insert into public.gebruikers (user_id, naam, rol)
-- select id, 'Gebruiker A', 'beheerder' from auth.users where email = 'a@voorbeeld.nl';
-- insert into public.gebruikers (user_id, naam, rol)
-- select id, 'Gebruiker B', 'eigenaar' from auth.users where email = 'b@voorbeeld.nl';
-- insert into public.gebruikers (user_id, naam, rol)
-- select id, 'Gebruiker C', 'lezer' from auth.users where email = 'c@voorbeeld.nl';
--
-- Openbare repository? Sla deze regels met echte e-mailadressen NIET op in git.
-- ---------------------------------------------------------------------------
