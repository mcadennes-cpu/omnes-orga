-- =====================================================================
-- 23-14 (etape 8I) : un compte cree dans l'appli est ouvert au Planning
--
-- LE PROBLEME (releve par Matthieu le 17/09/2026, apres la bascule)
-- Un medecin cree depuis le Trombinoscope (fonction create-medecin)
-- n'apparait pas dans le Planning. Deux colonnes gouvernent l'agenda, et
-- un compte neuf herite de leur valeur par defaut, false :
--   . agenda_beta_access : sans lui, agenda.peut_acceder() refuse tout --
--     le compte n'ouvre pas le module ;
--   . is_agenda_doctor : sans lui, le compte n'est pas propose a
--     l'attribution d'une garde.
-- Piege annonce en 8E (« tout nouveau compte medecin devra recevoir le
-- drapeau a la main »), et deja atteint : Lea JACQUET, remplacante creee a
-- 15h33 le jour de la bascule, n'a ni l'un ni l'autre.
--
-- POURQUOI UN DECLENCHEUR, ET NON LA FONCTION create-medecin
-- La creation a plusieurs chemins : l'appli, les scripts (23-9), le
-- tableau de bord Supabase. Un declencheur sur public.profiles les couvre
-- tous, et couvre aussi le changement de role -- sans redeployer la
-- fonction serveur.
--
-- LA REGLE : LE ROLE DECIDE, A LA CREATION ET A CHAQUE CHANGEMENT DE ROLE
--   remplacant, associe, associe_gerant -> medecin + drapeau
--   super_admin    -> drapeau ; medecin seulement s'il tient deja des gardes
--                     ou des regles de plan (meme critere factuel que 23-3 :
--                     Matthieu exerce, Charlotte coordonne)
--   poste_bureau, et tout autre role -> ni l'un ni l'autre
-- Un UPDATE qui ne change pas le role ne fait RIEN : enregistrer une fiche
-- ne rouvre pas un compte. Les 7 comptes bloques par 23-11 ne sont donc
-- touches que si quelqu'un change leur role.
--
-- LE PIEGE DE LA CREATION EN DEUX TEMPS
-- create-medecin cree le compte, handle_new_user insere le profil avec le
-- role par defaut 'remplacant' (-> medecin + drapeau), PUIS la fonction
-- applique le vrai role. Pour un super_admin, c'est l'UPDATE qui retire la
-- designation medecin posee a l'INSERT -- d'ou le critere « tient des
-- gardes » plutot qu'un « ne pas toucher » qui la laisserait en place.
--
-- SECURITY DEFINER : le critere super_admin lit agenda.shifts ; la
-- fonction doit le voir quel que soit l'utilisateur qui modifie le profil.
--
-- Rattrapage : Lea JACQUET, seul compte actif non bloque d'un role medecin
-- a qui manque l'une des deux colonnes (mesure du 17/09/2026, controle
-- ci-dessous : le script s'arrete si ce n'est plus le cas).
--
-- Rejouable : create or replace / drop if exists ; le rattrapage ne trouve
-- plus rien au second passage.
-- A executer sur le projet ydihrgnixthrraprclox.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. La regle
-- ---------------------------------------------------------------------
create or replace function public.designer_agenda_selon_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role then
    return new;
  end if;

  if new.role in ('remplacant', 'associe', 'associe_gerant') then
    new.is_agenda_doctor := true;
    new.agenda_beta_access := true;
  elsif new.role = 'super_admin' then
    new.agenda_beta_access := true;
    new.is_agenda_doctor := exists (select 1 from agenda.shifts s
                                     where s.assigned_doctor_id = new.id)
                         or exists (select 1 from agenda.rotation_plan_rules r
                                     where r.doctor_id = new.id);
  else
    new.is_agenda_doctor := false;
    new.agenda_beta_access := false;
  end if;
  return new;
end;
$$;

comment on function public.designer_agenda_selon_role() is
  '23-14 : le role decide de is_agenda_doctor et agenda_beta_access, a la creation et a chaque changement de role.';

drop trigger if exists designer_agenda_selon_role on public.profiles;
create trigger designer_agenda_selon_role
  before insert or update of role on public.profiles
  for each row execute function public.designer_agenda_selon_role();

-- ---------------------------------------------------------------------
-- 2. Rattrapage des comptes crees avant le declencheur
-- ---------------------------------------------------------------------
do $$
declare
  n integer;
  autres text;
begin
  select count(*), string_agg(u.email, ', ')
         filter (where lower(u.email) <> 'leam.jacquet@gmail.com')
    into n, autres
    from public.profiles p join auth.users u on u.id = p.id
   where p.role in ('remplacant', 'associe', 'associe_gerant')
     and p.actif
     and (u.banned_until is null or u.banned_until <= now())
     and (not p.is_agenda_doctor or not p.agenda_beta_access);
  if autres is not null then
    raise exception 'ARRET : comptes a rattraper inattendus : %', autres;
  end if;
  raise notice '23-14 : % compte(s) a rattraper', n;
end $$;

update public.profiles p
   set is_agenda_doctor = true,
       agenda_beta_access = true
  from auth.users u
 where u.id = p.id
   and p.role in ('remplacant', 'associe', 'associe_gerant')
   and p.actif
   and (u.banned_until is null or u.banned_until <= now())
   and (not p.is_agenda_doctor or not p.agenda_beta_access);

-- ---------------------------------------------------------------------
-- 3. Verification
--
-- Attendu : declencheur = 1 ; lea_medecin = true ; lea_drapeau = true ;
-- regle_non_respectee = 0 ; bureau_ouvert = 0 ; super_admin_drapeau = 2 ;
-- medecins = 31 (30 + Lea).
-- ---------------------------------------------------------------------
select (select count(*) from pg_trigger
         where tgname = 'designer_agenda_selon_role'
           and tgrelid = 'public.profiles'::regclass)                  as declencheur,
       (select is_agenda_doctor from public.profiles p join auth.users u on u.id = p.id
         where lower(u.email) = 'leam.jacquet@gmail.com')               as lea_medecin,
       (select agenda_beta_access from public.profiles p join auth.users u on u.id = p.id
         where lower(u.email) = 'leam.jacquet@gmail.com')               as lea_drapeau,
       (select count(*) from public.profiles p join auth.users u on u.id = p.id
         where p.role in ('remplacant', 'associe', 'associe_gerant')
           and p.actif and (u.banned_until is null or u.banned_until <= now())
           and (not p.is_agenda_doctor or not p.agenda_beta_access))    as regle_non_respectee,
       (select count(*) from public.profiles
         where role = 'poste_bureau'
           and (is_agenda_doctor or agenda_beta_access))               as bureau_ouvert,
       (select count(*) from public.profiles
         where role = 'super_admin' and agenda_beta_access)            as super_admin_drapeau,
       (select count(*) from public.profiles where is_agenda_doctor)   as medecins;

commit;
