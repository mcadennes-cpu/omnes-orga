-- =====================================================================
-- Correction 23-5 : clore les gardes passees restees ouvertes
--
-- DE QUOI IL S'AGIT
-- Depuis MOD-1, l'offre ouvre chaque semaine et le roulement s'y pose
-- quand ses regles tombent. Une garde qui reste "free" est donc un
-- creneau ouvert que personne n'a fini par couvrir. L'application
-- d'origine n'avait aucun etat pour cela : un creneau non pourvu restait
-- ouvert indefiniment.
--
-- Ces lignes ne sont PAS du dechet : elles mesurent la couverture du
-- cabinet (releve du 26/08/2026 -- entre 6 et 11 % des creneaux selon le
-- mois, 0 % en juin 2026, 19 % en aout, congés). Elles restent donc en
-- base et interrogeables ; ce script les fait seulement sortir des
-- ecrans, ou elles n'ont plus rien a faire.
--
-- POURQUOI LA SUPPRESSION DOUCE ET NON UN STATUT « NON POURVUE »
-- Arbitre par Matthieu le 26/08/2026. La machinerie existe depuis
-- MOD2-B : poser un deleted_at les fait disparaitre de TOUTES les
-- requetes du module par la policy de lecture, sans toucher une seule
-- requete applicative. Un nouveau statut aurait touche la contrainte de
-- statut, statusStyles.ts, les badges, les filtres, les policies et le
-- declencheur update_shift_status -- pour une information que la
-- suppression douce conserve deja. Contrepartie assumee : le journal dira
-- « a supprime » la ou le sens exact est « non pourvue ».
--
-- ORDRE DES DEUX BLOCS -- il n'est pas indifferent.
-- update_shift_status ne reagit qu'aux demandes dont l'etat d'AVANT est
-- 'pending' ou 'on_hold'. Refermer une demande encore active fait donc
-- ecrire le declencheur dans shifts ; on le laisse s'exercer AVANT de
-- poser le deleted_at, plutot que de le laisser reveiller une garde
-- qu'on vient de clore. Les demandes approuvees du bloc 1, elles,
-- n'activent aucune branche -- verifie dans le corps de la fonction.
--
-- RE-EXECUTABLE. Chaque mois en ajoute une vingtaine : ce script peut
-- etre rejoue tel quel, ses conditions ne rattrapent que ce qui reste.
--
-- A executer sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les demandes approuvees orphelines
--
-- 37 gardes passees portent une demande APPROUVEE alors qu'elles sont
-- libres et sans medecin. Approuver puis liberer la garde ne referme pas
-- la demande : elle reste "approved" dans le vide.
--
-- Ce n'est pas un reliquat de l'incident du 29/07 -- verifie : elles
-- s'etalent sur une trentaine de dates entre decembre 2025 et avril
-- 2026, pas sur les quatre dates de l'incident. Plus aucun cas depuis
-- avril 2026.
--
-- Meme arbitrage que le 29/07 pour les 15 fantomes : la garde n'a pas eu
-- lieu pour ce medecin, la demande n'a plus d'objet. Sans cette cloture,
-- un futur bilan par medecin les compterait comme des gardes obtenues.
-- ---------------------------------------------------------------------
update agenda.requests rq
   set status = 'cancelled',
       reviewed_at = now(),
       rejection_note = 'Cloturee par 23-5 : garde passee restee libre, demande sans objet'
  from agenda.shifts s
 where s.id = rq.shift_id
   and rq.status = 'approved'
   and s.date < current_date
   and s.deleted_at is null
   and s.status in ('free', 'pending')
   and s.assigned_doctor_id is null;

-- ---------------------------------------------------------------------
-- 2. Les demandes encore actives sur ces memes gardes
--
-- Une seule au 26/08/2026. Laisser une demande "pending" sur une garde
-- close la rendrait invisible a son auteur sans jamais etre tranchee.
--
-- C'est ici que update_shift_status s'exerce : la garde repasse en
-- 'free'. C'est voulu, et c'est pourquoi ce bloc precede le suivant.
-- ---------------------------------------------------------------------
update agenda.requests rq
   set status = 'cancelled',
       reviewed_at = now(),
       rejection_note = 'Cloturee par 23-5 : garde passee non pourvue'
  from agenda.shifts s
 where s.id = rq.shift_id
   and rq.status in ('pending', 'on_hold')
   and s.date < current_date
   and s.deleted_at is null
   and s.status in ('free', 'pending');

-- ---------------------------------------------------------------------
-- 3. Les gardes elles-memes
--
-- Bornage a current_date : on ne touche JAMAIS au present ni au futur.
-- C'est l'arbitrage rendu le 03/08 pour le roulement et repris le 06/08
-- pour les series -- la lecon de l'incident du 29/07, ou un filtre plus
-- large que l'intention avait libere 100 gardes.
--
-- status in ('free','pending') : les gardes attribuees ne sont pas
-- concernees, elles ont eu lieu.
-- ---------------------------------------------------------------------
update agenda.shifts
   set deleted_at = now(),
       updated_at = now()
 where date < current_date
   and deleted_at is null
   and status in ('free', 'pending');

-- =====================================================================
-- Controles
--
-- 1. Plus aucune garde passee ouverte et visible :
--
--   select count(*) from agenda.shifts
--    where date < current_date and deleted_at is null
--      and status in ('free','pending');
--   -- attendu : 0
--
-- 2. Le present et le futur sont intacts :
--
--   select count(*) from agenda.shifts
--    where date >= current_date and deleted_at is not null;
--   -- attendu : inchange (0 si aucune suppression future par ailleurs)
--
-- 3. Aucune garde ATTRIBUEE n'a ete touchee PAR CE SCRIPT.
--
--    ⚠ Ne pas compter les gardes attribuees supprimees en general : il en
--    existe 31, du 04 au 10/01/2027, supprimees le 06/08/2026 a 13:23 --
--    reliquat de l'annulation de duplication, deja documente sous « le
--    second index unique oublie par MOD2-B ». Elles n'ont rien a voir
--    avec ce script, et un controle global crierait au loup a chaque
--    reexecution. On borne donc a la fenetre d'execution :
--
--   select status, count(*) from agenda.shifts
--    where deleted_at > now() - interval '5 minutes' group by status;
--   -- attendu : uniquement 'free' (et 'pending' le cas echeant),
--   --           jamais 'assigned'
--
-- 4. Plus de demande approuvee orpheline :
--
--   select count(*) from agenda.shifts s
--     join agenda.requests rq on rq.shift_id = s.id
--    where rq.status = 'approved' and s.assigned_doctor_id is null
--      and s.date < current_date;
--   -- attendu : 0
--
-- 5. Le bilan de couverture reste interrogeable (c'est tout l'interet
--    de la suppression douce).
--
--    ⚠ Borner au PASSE. Sans « date < current_date », le compte ramasse
--    aussi 50 gardes de janvier 2027 supprimees le 06/08/2026 -- meme
--    reliquat d'annulation de duplication que les 31 du controle 3.
--    Elles sont supprimees, mais pas « non pourvues » : elles n'ont
--    jamais eu lieu.
--
--   select to_char(date,'YYYY-MM') mois, count(*) non_pourvues
--     from agenda.shifts
--    where deleted_at is not null and status in ('free','pending')
--      and date < current_date
--    group by 1 order by 1;
--   -- releve au 26/08/2026 : 155 au total, de 13 (juillet) a 30 (aout),
--   --   et aucune en juin 2026 -- mois integralement couvert.
-- =====================================================================
