Projet Omnès Médecins (React/Vite + Supabase, PWA). Branche
feature/module-agenda. Arbre propre.

Lis d'abord CLAUDE.md et docs/cabinet-medical-app.md (section « Étape 17 »
et « Étape 18 » pour les notifications push, et « Limitations connues »).
On touche au module Agenda : lis donc AUSSI docs/integration-agenda.md
(entrées 8N à 8Q en tête de l'étape 8), et charge le skill
workflow-mentorat-omnes. Charge design-system-omnes seulement si on touche
un écran (ex. un réglage de notifications).

OÙ ON EN EST (au 24/09/2026 au soir)
- Production ouverte depuis le 17/09/2026. 41 fiches (2 super_admin,
  3 associe_gerant, 6 associe, 29 remplacant, 1 poste_bureau).
- main = branche = 9e035f0 déployé le 24/09 (Planning du jour et Mes gardes
  en cartes teintées, onglet actif en marine — 8P). La branche a un commit
  de doc de plus (8ae5045, 8Q : page de redirection Bolt), non déployé car
  sans effet sur l'appli : vérifier git log main..HEAD avant tout.
- L'ancienne appli Bolt est remplacée par une page statique de redirection
  (8Q). Chantier 4 clos.

OBJECTIF DE LA SESSION
Brancher le module Planning sur les notifications push existantes : qu'une
action du planning qui concerne quelqu'un lui envoie une notification.
Ne rien entamer d'autre.

COMMENCER PAR REGARDER, PAS PAR CODER
Première sous-étape = un état des lieux et une proposition, sans une ligne
de code : quels événements notifier, à qui, avec quel texte, par quel
mécanisme. Me la présenter et attendre ma validation.

CE QUI EXISTE DÉJÀ CÔTÉ PUSH (étapes 17 et 18, ne pas réinventer)
- Firebase Cloud Messaging. Edge Function supabase/functions/send-notification
  : { userIds, title, body, url } → lit les profiles.fcm_token → envoie en
  data-only. Recalcule aussi la pastille d'icône (get_activite_count) par
  destinataire. Tout utilisateur authentifié peut l'appeler (assumé en V1).
- Côté client : src/lib/notify.js expose notifyUsers({ userIds, title, body,
  url }), « fire-and-forget » : filtre les ids vides, avale les erreurs —
  une notif qui échoue ne doit JAMAIS casser l'action métier.
- Convention des déclencheurs existants (Discussion, Immobilier, sondages,
  événements) : appel APRÈS écriture réussie, en EXCLUANT l'auteur.
- Le clic sur une notification ouvre `url` (18E-3 : postMessage du service
  worker + navigation React Router dans App.jsx).
- Un seul appareil par personne (une seule colonne fcm_token).

CE QUI A ÉTÉ MESURÉ LE 24/09 (à ne pas redécouvrir, mais à revérifier si
une décision en dépend)
- ⚠ Notifications activées : 9 fiches sur 41 seulement. super_admin 2/2,
  associe_gerant 3/3, associe 2/6, remplacant 2/29, poste_bureau 0/1.
  Les remplaçants, premiers concernés par le Planning, ne recevront
  presque rien tant qu'ils n'ont pas activé les notifications (Profil →
  « Activer les notifications », PWA installée obligatoire sur iPhone).
  Le chantier doit poser la question de l'adoption, pas seulement du code.
- Le module Agenda n'appelle notifyUsers nulle part aujourd'hui.
- Activité sur 7 jours (agenda.activity_log) : 39 demandes de garde
  créées, 25 demandes traitées, 89 mises à jour de gardes. Historique
  des demandes : 904 acceptées, 1159 refusées, 631 annulées, 26 en attente.
  → Beaucoup de refus : quand une garde est attribuée, les autres demandes
  sont refusées en masse. Notifier chaque refus pourrait être bruyant :
  à trancher avec moi.
- Pas d'extension pg_net ni pg_cron en base : un déclencheur côté SQL
  (trigger qui appelle l'Edge Function) demanderait d'en installer une.
  Le pattern du projet est l'appel côté client via notifyUsers.
- Les écritures du module passent surtout par :
  hooks/useShiftDetail.ts (validation, refus, mise en attente,
  annulation — 12 écritures), AssignDoctorModal, BulkAssignPrevalidatedModal,
  OpenWeeksModal (rpc ouvrir_semaines), CreateShiftModal, MyScheduleView
  (retrait d'une demande), ActionToast (annulation via restaurer_action).
- Pas de lien profond vers un onglet du Planning : l'onglet courant est un
  état React (App.tsx, vueParDefaut), pas une URL. Une notification ne peut
  aujourd'hui ouvrir que /planning, sur l'onglet d'accueil du rôle.
  Ajouter un paramètre d'URL (ex. /planning?vue=schedule) est une décision
  à part — me la proposer, ne pas la prendre seul.
- Aucune table agenda dans la publication supabase_realtime (chantier 2) :
  sans rapport direct avec le push, ne pas mélanger les deux chantiers.

QUESTIONS DE PRODUIT À ME POSER (ne pas trancher seul)
1. Quels événements notifier ? Pistes : ma demande est acceptée / refusée ;
   une garde m'est attribuée ou retirée par la coordination ; nouvelles
   semaines ouvertes (à tous les remplaçants ?) ; nouvelle demande reçue
   (à la coordinatrice, Charlotte) ; garde annulée.
2. Refus en masse : un push par refus, un résumé, ou rien ?
3. Nouvelles semaines ouvertes : tout le monde, ou seulement les remplaçants ?
4. La pastille d'icône doit-elle compter les demandes en attente de la
   coordinatrice ? Cela toucherait get_mon_activite / get_activite_count
   (SQL, donc script numéroté).
5. Comment pousser l'activation chez les 27 remplaçants qui ne l'ont pas ?
   (message au cabinet, rappel dans le Planning…)

CE QU'IL FAUT SAVOIR SUR LE MODULE AGENDA
- src/modules/agenda, ni typé ni linté : vérifier les imports à la main,
  et npm run build après CHAQUE modif. notify.js est en JS hors module.
- Deux suites de test à relancer après toute modif du module :
    npm run test:fuseaux      167 contrôles, 5 fuseaux
    npm run test:pagination    55 contrôles
  Bloquées en écriture sur la prod (8F-5) : si une suite doit écrire,
  OMNES_CIBLE=test.
- reference-agenda/ : lecture seule, ne JAMAIS le modifier.

TESTER UNE NOTIFICATION
- Un push ne se teste vraiment que sur la PWA installée, en HTTPS : le
  serveur de dev en http://192.168.x.x n'enregistre pas de service worker
  (iOS). Prévoir le test sur une prévisualisation Vercel ou après
  déploiement, avec mon téléphone.
- Attention : les prévisualisations Vercel sont branchées sur la base de
  PRODUCTION. Une action de test y écrit dans le vrai planning et
  enverrait un vrai push à un vrai médecin. Choisir des destinataires de
  test (mon compte) et me dire avant ce qui partira.
- Si la connexion tourne sans fin : tester d'abord /auth/v1/token en curl.
  Le 24/09 vers 20h, le service de connexion de Supabase a cessé de répondre
  pendant quelques minutes, sans lien avec l'appli.

GARDE-FOUS
- Ne jamais lancer npm install sans mon accord.
- Toute écriture en base : script numéroté dans docs/sql (prochain :
  23-27), sauvegarde 23-16 juste avant, mesure avant, vérification après,
  simulation par défaut, et mon accord avant toute exécution réelle.
- Ne JAMAIS relancer 22-8A-1 --go ni 22-7F.
- Une notification part vers de vraies personnes : aucun envoi réel sans
  m'avoir dit à qui et avec quel texte.
- Git : tu proposes toi-même add + commit + push sur la branche dès qu'une
  sous-étape est validée. Messages sans accent.
- Déploiement : tu lances les 4 commandes (checkout main, merge, push
  origin main, retour sur la branche) SEULEMENT après mon « go »,
  contrôle à blanc avant (git log HEAD..main vide).

CHANTIERS OUVERTS (ne pas les entamer sans me demander)
1. Pas d'écran « changer mon mot de passe » dans le profil (27 personnes
   sur leur mot de passe Bolt d'origine ; la brique NouveauMotDePasse.jsx
   existe). Mis de côté par moi le 24/09.
2. Temps réel : aucune table agenda dans supabase_realtime.
3. Clôture mensuelle des gardes non pourvues (23-5) : manuelle.
5. J4 Beaune, salle par défaut Salle 3 : le Roulement V2 y ouvre de vraies
   gardes dès le 04/01/2027. Ne PAS supprimer le créneau.
6. Suppression définitive des 8 comptes bloqués, si on la décide.
7. Bucket avatars public (décision de produit).
8. anon a les droits DML sur les 27 tables de public ; seule la RLS
   l'arrête (dernière pièce du chantier D).
9. Dette de nommage Discussion (anglais) vs Immobilier (français).
10. Breadcrumb des Drives limité à 2 segments.
11. Les verts hors design system du module agenda (statut « assigné ») —
    décision de juillet à confirmer ou à acter comme exception.
12. borderClass (liseré en L) n'est plus affiché nulle part depuis 8P :
    à retirer de horaireStyles.ts si le choix se confirme à l'usage.

RYTHME
Regarder avant de produire, mesurer avant de proposer. Découper en
sous-étapes, montrer les fichiers modifiés et attendre ma validation avant
d'enchaîner. Proposer toi-même le commit et le push quand une sous-étape
est validée. Rien d'irréversible sans mon accord explicite.
