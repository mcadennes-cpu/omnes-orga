-- =====================================================================
-- Etape 22 / 7E-1 : enrichit la vue agenda.profiles pour les avatars
--
-- Le composant <Avatar> de l'appli principale attend prenom, nom,
-- photo_url et updated_at (ce dernier sert au cache-busting de l'image).
-- La vue creee en 7C-1 n'exposait que le format strict de l'ancienne base
-- Planning : les vraies photos ne pouvaient donc pas s'afficher, alors
-- que c'etait l'un des benefices attendus de la migration.
--
-- CREATE OR REPLACE VIEW autorise l'ajout de colonnes en fin de liste,
-- a condition de conserver les colonnes existantes dans le meme ordre.
-- =====================================================================

create or replace view agenda.profiles with (security_invoker = true) as
  select id,
         email,
         trim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))       as full_name,
         case when is_agenda_coordinator then 'coordinator'
              else 'doctor' end                                        as role,
         actif                                                         as is_active,
         -- Ajouts 7E-1 : alimentent <Avatar> (initiales + vraie photo).
         prenom,
         nom,
         photo_url,
         updated_at
  from public.profiles;

grant select on agenda.profiles to authenticated, service_role;

-- Controle : combien de medecins ayant des gardes ont une photo ?
select count(*)                                              as medecins_sur_le_planning,
       count(*) filter (where photo_url is not null)          as avec_photo,
       count(*) filter (where photo_url is null)              as sans_photo_initiales
  from agenda.profiles p
 where exists (select 1 from agenda.shifts s where s.assigned_doctor_id = p.id);
