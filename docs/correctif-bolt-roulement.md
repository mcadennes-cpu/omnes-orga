# Correctif à reporter dans l'appli Bolt (OMNÈS PLANNING)

> Incident du 29/07/2026 — 100 gardes libérées par erreur.
> Le même défaut existe dans les deux applications ; corriger Omnès-Orga ne
> protège pas le cabinet tant que Bolt tourne en production.

## Le problème en une phrase

Quand on clique sur **« Supprimer la règle de roulement »**, l'application
supprime bien la règle correspondant à *une* case du roulement (un jour de
semaine, une semaine de cycle, un médecin) — mais elle libère **toutes** les
gardes futures du créneau, tous jours et toutes semaines confondus.

Mesuré sur les données réelles : un seul clic a libéré **67 gardes** au lieu
de **2**.

---

## Fichier à modifier

`src/components/ShiftDetailModal.tsx`, dans la fonction
`handleCancelAssignment`, branche `if (scope === 'rotation')`.

**Aucun nouvel import n'est nécessaire** : le correctif n'utilise que
`getRotationWeek`, déjà importé en haut du fichier.

## Le code à remplacer

Repérer ce bloc (il suit immédiatement le `if (deleteRuleError) throw deleteRuleError;`) :

```tsx
        const { error: updateError } = await supabase
          .from('shifts')
          .update({
            status: 'free',
            assigned_doctor_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('site_id', shift.site_id)
          .eq('room_id', shift.room_id)
          .eq('shift_type_id', shift.shift_type_id)
          .gte('date', shift.date);

        if (updateError) throw updateError;

        alert('Règle de roulement supprimée. Toutes les futures gardes correspondantes ont été libérées.');
```

Les trois lignes fautives sont les `.eq(...)` suivies du `.gte('date', ...)` :
il manque le jour de la semaine, la semaine de roulement et le médecin.

## Le code de remplacement

```tsx
        // La semaine de roulement n'est pas une colonne : elle se calcule a
        // partir de la date. On ne peut donc pas la filtrer en SQL. On
        // restreint au maximum cote base (site, salle, creneau, medecin,
        // date), puis on ne garde que les gardes qui retombent sur la MEME
        // case du roulement que celle dont on supprime la regle.
        const { data: candidates, error: fetchError } = await supabase
          .from('shifts')
          .select('id, date')
          .eq('site_id', shift.site_id)
          .eq('room_id', shift.room_id)
          .eq('shift_type_id', shift.shift_type_id)
          .eq('assigned_doctor_id', shift.assigned_doctor_id)
          .gte('date', shift.date);

        if (fetchError) throw fetchError;

        const shiftIds = (candidates ?? [])
          .filter(candidate => {
            const candidateDate = new Date(candidate.date);
            return (
              candidateDate.getDay() === weekday &&
              getRotationWeek(candidateDate, settings) === rotationWeek
            );
          })
          .map(candidate => candidate.id);

        if (shiftIds.length > 0) {
          const { error: updateError } = await supabase
            .from('shifts')
            .update({
              status: 'free',
              assigned_doctor_id: null,
              updated_at: new Date().toISOString()
            })
            .in('id', shiftIds);

          if (updateError) throw updateError;
        }

        alert(`Règle de roulement supprimée. ${shiftIds.length} garde(s) future(s) libérée(s).`);
```

Les variables `settings`, `weekday` et `rotationWeek` sont déjà définies
quelques lignes plus haut dans la même fonction — il n'y a rien d'autre à
ajouter.

---

## Comment l'appliquer dans Bolt

**Éditer le fichier directement** dans l'éditeur de code de Bolt, plutôt que
de demander la modification par un prompt. Un prompt fait réécrire des
portions de fichier par le modèle, avec le risque de toucher à du code voisin
qui fonctionne — sur une application de production utilisée quotidiennement,
ce n'est pas le bon outil pour une correction de trois lignes.

Si l'édition directe n'est pas possible, formuler un prompt **strictement
délimité** :

> Dans `src/components/ShiftDetailModal.tsx`, fonction `handleCancelAssignment`,
> branche `scope === 'rotation'` : remplace uniquement le bloc qui met les
> gardes à `free` par le code que je te donne. Ne modifie aucune autre partie
> du fichier, ni aucun autre fichier.

## Vérification après déploiement

Le module écrit dans la **vraie base de production**. Vérifier ainsi :

1. Créer une garde sur le **Site TEST**, à une **date future**, et l'assigner.
2. L'ajouter au roulement.
3. Cliquer sur « Supprimer la règle de roulement ».
4. Le message doit annoncer un **petit nombre** de gardes libérées (celles de
   la même case uniquement), et non « toutes les futures gardes ».
5. Vérifier dans le calendrier qu'aucune garde d'un autre jour de la semaine
   n'a été libérée.
6. Supprimer la garde de test.

## Une fois Bolt corrigé

Les deux applications sont alignées et le garde-fou côté base de données
devient inutile. Ce point pourra être définitivement clos à l'étape 7, quand
les données seront migrées et que l'appli Bolt sera éteinte.
