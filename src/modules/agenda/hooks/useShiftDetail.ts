import { useEffect, useState } from 'react';
import { Shift, supabase } from '../lib/supabase';
import {
  getRotationPlans,
  getPlanForDate,
  getRotationWeek,
  getRotationSlot,
} from '../lib/rotationUtils';
import { useToast } from '../components/ui/ActionToast';
import { checkDoctorDailyConflict } from '../lib/shiftValidation';

// Boite regroupant toute la "mecanique" de la fenetre de detail d'une garde
// (etat, chargements a l'ouverture, actions du coordinateur). Le composant
// ShiftDetailModal ne garde que l'affichage. Extraction iso-comportement de
// l'ancien composant : aucune logique metier n'a change ici.
//
// Seule addition volontaire : une garde "cancelled" sur les chargements
// d'ouverture (voir useEffect), pour ignorer les donnees qui reviennent apres
// la fermeture de la fenetre. C'est de la lecture seule : ca n'ecrit jamais en
// base et ne peut donc pas expliquer une garde qui "saute".

// Quand on (pre)valide un nouveau medecin sur une garde deja assignee a un autre,
// on rend sa demande a l'ancien medecin : sa demande existante repasse en pending,
// ou on la recree si elle n'existe plus. Utilise par handleApprove et handleSetOnHold.
async function revertPreviousDoctorRequest(
  shiftId: string,
  previousDoctorId: string | null | undefined,
  newDoctorId: string
): Promise<void> {
  if (!previousDoctorId || previousDoctorId === newDoctorId) return;

  const { data: existingRequest } = await supabase
    .from('requests')
    .select('id, status')
    .eq('shift_id', shiftId)
    .eq('doctor_id', previousDoctorId)
    .maybeSingle();

  if (existingRequest) {
    const { error: revertError } = await supabase
      .from('requests')
      .update({
        status: 'pending',
        reviewed_at: null
      })
      .eq('id', existingRequest.id);

    if (revertError) throw revertError;
  } else {
    const { error: createError } = await supabase
      .from('requests')
      .insert({
        shift_id: shiftId,
        doctor_id: previousDoctorId,
        status: 'pending',
        requested_at: new Date().toISOString()
      });

    if (createError) throw createError;
  }
}

// Gardes futures qui occupent la MEME case de roulement que `shift` : meme
// site, salle et creneau, meme medecin, meme jour de la semaine et meme
// semaine de cycle, a partir de la date de `shift` incluse.
//
// Pourquoi un filtre en deux temps : la semaine de roulement n'est pas une
// colonne, elle se calcule a partir de la date (getRotationSlot). Impossible
// donc de l'exprimer en SQL. On restreint au maximum cote base (site, salle,
// creneau, medecin, date), puis on ne garde que les gardes qui retombent sur
// la meme case. Meme demarche que handleApplyToRotationWeek.
//
// C'est ce filtrage qui manquait : la version precedente libererait toutes les
// gardes futures du creneau, tous jours et toutes semaines confondus.
async function findRotationSlotShifts(shift: Shift): Promise<{
  weekday: number;
  rotationWeek: number;
  shiftIds: string[];
}> {
  const plans = await getRotationPlans();
  const plan = getPlanForDate(new Date(shift.date), plans);
  if (!plan) {
    throw new Error('Aucun plan de roulement ne couvre cette date');
  }

  const { rotationWeek, weekday } = getRotationSlot(
    new Date(shift.date),
    plan,
    { componentName: 'useShiftDetail.findRotationSlotShifts', inputOrigin: `shift.date: "${shift.date}"` }
  );

  const { data, error } = await supabase
    .from('shifts')
    .select('id, date')
    .eq('site_id', shift.site_id)
    .eq('room_id', shift.room_id)
    .eq('shift_type_id', shift.shift_type_id)
    .eq('assigned_doctor_id', shift.assigned_doctor_id)
    .gte('date', shift.date);

  if (error) throw error;

  const shiftIds = (data ?? [])
    .filter(candidate => {
      // Une garde regie par un AUTRE plan n'est pas dans la meme case : le
      // roulement a change entre-temps. Sans ce test, une action passee sur
      // decembre 2026 toucherait des gardes de 2027 relevant du V2.
      const candidatePlan = getPlanForDate(new Date(candidate.date), plans);
      if (!candidatePlan || candidatePlan.id !== plan.id) return false;

      const slot = getRotationSlot(
        new Date(candidate.date),
        candidatePlan,
        { componentName: 'useShiftDetail.findRotationSlotShifts(filter)', inputOrigin: `candidate.date: "${candidate.date}"` }
      );
      return slot.rotationWeek === rotationWeek && slot.weekday === weekday;
    })
    .map(candidate => candidate.id);

  return { weekday, rotationWeek, shiftIds };
}

// Les gardes que « libérer toute la série » doit rendre libres.
//
// Arbitré avec Matthieu le 06/08/2026, après que le journal d'activité eut
// montré, dès son premier jour, que l'action réécrivait TOUTE la série — tous
// médecins et toutes dates confondus — pour libérer une seule garde.
//
// Deux bornes, alignées sur le correctif du 03/08 pour le roulement :
//   * le MÊME MÉDECIN que la garde ouverte. On part de la garde du Dr X, on
//     libère les siennes ; sur la série WE1 Dijon, l'ancien comportement
//     déshabillait les neuf médecins d'un clic.
//   * à partir d'AUJOURD'HUI. On ne dé-assigne pas une garde déjà effectuée :
//     le planning passé est un historique, pas un état modifiable.
//
// Renvoie une liste d'identifiants explicite plutôt qu'un filtre ouvert —
// la leçon de l'incident du 29/07, où un filtre trop large avait libéré
// 100 gardes d'un seul clic.
async function findSeriesShiftsToFree(shift: Shift): Promise<string[]> {
  if (!shift.series_id || !shift.assigned_doctor_id) return [];

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('shifts')
    .select('id')
    .eq('series_id', shift.series_id)
    .eq('assigned_doctor_id', shift.assigned_doctor_id)
    .gte('date', aujourdhui);

  if (error) throw error;
  return (data ?? []).map((candidate) => candidate.id);
}

export function useShiftDetail(shift: Shift, onSuccess: () => void, onClose: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showEditSeriesModal, setShowEditSeriesModal] = useState(false);
  const [showValidatedConfirm, setShowValidatedConfirm] = useState(false);
  const [showCancelAssignmentModal, setShowCancelAssignmentModal] = useState(false);
  const [showApplyToRotationWeekConfirm, setShowApplyToRotationWeekConfirm] = useState(false);
  const [showDeletionBlockedModal, setShowDeletionBlockedModal] = useState(false);
  // MOD2-F : les deux confirmations qui passaient encore par confirm(). Un hook
  // ne rend rien -- il porte le drapeau, ShiftDetailModal affiche la feuille.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFreeShiftConfirm, setShowFreeShiftConfirm] = useState(false);
  const [seriesAction, setSeriesAction] = useState<'modify' | 'delete' | null>(null);
  const [rotationInfo, setRotationInfo] = useState<{ week: number; total: number } | null>(null);
  const [hasRotationRule, setHasRotationRule] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [pendingActionRequest, setPendingActionRequest] = useState<{id: string, doctorId: string, action: 'approve' | 'setOnHold'} | null>(null);
  const [showConflictError, setShowConflictError] = useState(false);
  const [conflictErrorMessage, setConflictErrorMessage] = useState('');
  // Nombre de gardes futures qui seront liberees par "Supprimer la regle de
  // roulement" (compte a titre d'avertissement, calcule a l'ouverture de la modale).
  const [rotationCancelCount, setRotationCancelCount] = useState<number | null>(null);
  const [seriesCancelCount, setSeriesCancelCount] = useState<number | null>(null);
  const { signalerAction } = useToast();

  const isPartOfSeries = !!shift.series_id;

  // Chargements a l'ouverture de la fenetre (lecture seule). La garde "cancelled"
  // ignore les reponses qui arrivent apres fermeture / changement de garde.
  useEffect(() => {
    let cancelled = false;

    const loadPendingRequests = async () => {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          id,
          doctor_id,
          requested_at,
          status,
          doctor:profiles!doctor_id(id, full_name, email)
        `)
        .eq('shift_id', shift.id)
        .in('status', ['pending', 'on_hold'])
        .order('requested_at', { ascending: true });

      if (cancelled) return;

      if (!error && data) {
        const filtered = (shift.status === 'assigned' && shift.assigned_doctor_id)
          ? data.filter(req => req.doctor_id !== shift.assigned_doctor_id)
          : data;
        setPendingRequests(filtered);
      }
    };

    const loadRotationInfo = async () => {
      const plan = getPlanForDate(new Date(shift.date), await getRotationPlans());
      if (cancelled) return;

      if (plan) {
        const week = getRotationWeek(
          new Date(shift.date),
          plan,
          { componentName: 'ShiftDetailModal.loadRotationInfo', inputOrigin: `shift.date: "${shift.date}"` }
        );
        setRotationInfo({ week, total: plan.cycle_length_weeks });
      } else {
        setRotationInfo(null);
      }
    };

    const checkRotationRule = async () => {
      if (!shift.assigned_doctor_id) {
        if (!cancelled) setHasRotationRule(false);
        return;
      }

      const plan = getPlanForDate(new Date(shift.date), await getRotationPlans());
      if (cancelled) return;

      if (!plan) {
        setHasRotationRule(false);
        return;
      }

      const shiftDate = new Date(shift.date);
      const rotationWeek = getRotationWeek(
        shiftDate,
        plan,
        { componentName: 'ShiftDetailModal.checkRotationRule', inputOrigin: `shift.date: "${shift.date}"` }
      );
      const weekday = shiftDate.getDay();

      // Pas de filtre sur la salle depuis 6B-3 : elle appartient au creneau,
      // pas au roulement.
      const { data: rule } = await supabase
        .from('rotation_plan_rules')
        .select('id')
        .eq('plan_id', plan.id)
        .eq('doctor_id', shift.assigned_doctor_id)
        .eq('site_id', shift.site_id)
        .eq('shift_type_id', shift.shift_type_id)
        .eq('weekday', weekday)
        .eq('rotation_week', rotationWeek)
        .maybeSingle();

      if (cancelled) return;
      setHasRotationRule(!!rule);
    };

    loadPendingRequests();
    loadRotationInfo();
    checkRotationRule();

    return () => {
      cancelled = true;
    };
  }, [shift.id]);

  const handleApproveClick = (requestId: string, doctorId: string) => {
    if (shift.status === 'assigned') {
      setPendingActionRequest({ id: requestId, doctorId, action: 'approve' });
      setShowValidatedConfirm(true);
    } else {
      handleApprove(requestId, doctorId);
    }
  };

  const handleApprove = async (requestId: string, doctorId: string) => {
    setLoading(true);
    setError('');

    try {
      await revertPreviousDoctorRequest(shift.id, shift.assigned_doctor_id, doctorId);

      const { error: approveError } = await supabase
        .from('requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (approveError) throw approveError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetOnHoldClick = (requestId: string, doctorId: string) => {
    if (shift.status === 'assigned') {
      setPendingActionRequest({ id: requestId, doctorId, action: 'setOnHold' });
      setShowValidatedConfirm(true);
    } else {
      handleSetOnHold(requestId, doctorId);
    }
  };

  const handleSetOnHold = async (requestId: string, doctorId: string) => {
    setLoading(true);
    setError('');

    try {
      const request = pendingRequests.find(r => r.id === requestId);
      const doctorName = request?.doctor.full_name;

      const validation = await checkDoctorDailyConflict(
        doctorId,
        shift.date,
        shift.id,
        doctorName
      );

      if (!validation.isValid) {
        setConflictErrorMessage(validation.errorMessage || 'Ce médecin a déjà une garde ce jour-là.');
        setShowConflictError(true);
        setLoading(false);
        return;
      }

      await revertPreviousDoctorRequest(shift.id, shift.assigned_doctor_id, doctorId);

      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'on_hold',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePrevalidation = async (requestId: string) => {
    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'pending',
          reviewed_at: null
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValidatedConfirm = () => {
    setShowValidatedConfirm(false);
    if (pendingActionRequest) {
      if (pendingActionRequest.action === 'approve') {
        handleApprove(pendingActionRequest.id, pendingActionRequest.doctorId);
      } else {
        handleSetOnHold(pendingActionRequest.id, pendingActionRequest.doctorId);
      }
      setPendingActionRequest(null);
    }
  };

  const handleDelete = async (scope: 'single' | 'series') => {
    setShowDeleteConfirm(false);
    setLoading(true);
    setError('');

    // Suppression douce (MOD2-B) : la ligne reste, marquee d'un deleted_at.
    // Restaurer redevient possible sans recreer d'identifiant -- ce qui
    // cassait les liens vers les demandes et la serie.
    //
    // On passe par une fonction plutot que par un UPDATE direct : la policy
    // de lecture masque les gardes supprimees, et PostgreSQL interdit a un
    // UPDATE de faire sortir une ligne de sa propre visibilite.
    try {
      if (scope === 'series' && shift.series_id) {
        const { data: shiftsInSeries, error: checkError } = await supabase
          .from('shifts')
          .select('id, status')
          .eq('series_id', shift.series_id)
          .in('status', ['assigned', 'pending']);

        if (checkError) throw checkError;

        if (shiftsInSeries && shiftsInSeries.length > 0) {
          setShowDeletionBlockedModal(true);
          setLoading(false);
          setShowSeriesModal(false);
          return;
        }

        const { error: deleteError } = await supabase
          .rpc('supprimer_serie', { p_series_id: shift.series_id });

        if (deleteError) throw deleteError;
      } else {
        if (shift.status === 'assigned' || shift.status === 'pending') {
          setShowDeletionBlockedModal(true);
          setLoading(false);
          return;
        }

        const { error: deleteError } = await supabase
          .rpc('supprimer_gardes', { p_shift_ids: [shift.id] });

        if (deleteError) throw deleteError;
      }

      signalerAction(
        scope === 'series' ? 'Série supprimée.' : 'Garde supprimée.'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setShowSeriesModal(false);
    }
  };

  const handleDeleteClick = () => {
    if (isPartOfSeries) {
      setSeriesAction('delete');
      setShowSeriesModal(true);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleSeriesActionSelect = (scope: 'single' | 'series') => {
    if (seriesAction === 'delete') {
      handleDelete(scope);
    }
  };

  const handleCancelAssignmentClick = async () => {
    if (isPartOfSeries || hasRotationRule) {
      // Avant d'ouvrir la modale, compter ce que l'action large libererait,
      // pour l'afficher en garde-fou. On passe par le MEME helper que l'action
      // elle-meme : le compteur annonce donc exactement ce qui sera libere,
      // sans risque de divergence entre l'annonce et le geste.
      if (hasRotationRule) {
        try {
          const { shiftIds } = await findRotationSlotShifts(shift);
          setRotationCancelCount(shiftIds.length);
        } catch {
          setRotationCancelCount(null);
        }
      } else if (isPartOfSeries) {
        try {
          setSeriesCancelCount((await findSeriesShiftsToFree(shift)).length);
        } catch {
          setSeriesCancelCount(null);
        }
      }
      setShowCancelAssignmentModal(true);
    } else {
      setShowFreeShiftConfirm(true);
    }
  };

  const handleCancelAssignment = async (scope: 'single' | 'series' | 'rotation') => {
    setShowCancelAssignmentModal(false);
    setShowFreeShiftConfirm(false);
    setLoading(true);
    setError('');

    try {
      let liberees = 1;

      if (scope === 'rotation') {
        // Libere les gardes futures de la MEME case de roulement (jour +
        // semaine de cycle + medecin).
        //
        // Depuis 6C-3, la REGLE du plan n'est plus supprimee : le plan vient
        // du fichier de roulement valide et l'application ne le modifie
        // jamais (principe de source unique, MOD-1). Consequence a assumer :
        // les gardes deja ouvertes sont liberees, mais toute garde recreee
        // plus tard sur cette case retrouvera le medecin du plan. Pour
        // changer cela durablement, il faut passer par le fichier -- c'est
        // l'objet des « modifications souhaitees » de 6G.
        const { shiftIds } = await findRotationSlotShifts(shift);

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

        liberees = shiftIds.length;
      } else if (scope === 'series' && shift.series_id) {
        // Voir findSeriesShiftsToFree : même médecin, à partir d'aujourd'hui,
        // et écriture sur une liste d'identifiants explicite.
        const shiftIds = await findSeriesShiftsToFree(shift);

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

        liberees = shiftIds.length;
      } else {
        const { error: updateError } = await supabase
          .from('shifts')
          .update({
            status: 'free',
            assigned_doctor_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', shift.id);

        if (updateError) throw updateError;
      }

      const gardes = `${liberees} garde${liberees > 1 ? 's' : ''} libérée${liberees > 1 ? 's' : ''}`;
      signalerAction(
        scope === 'rotation'
          // Le rappel que portait l'alert() bloquant reste, sans barrer l'écran.
          ? `${gardes}. Le roulement n'est pas modifié : une garde recréée sur cette case retrouvera le même médecin.`
          : `${gardes}.`
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToRotationWeek = async () => {
    setShowApplyToRotationWeekConfirm(false);
    setLoading(true);
    setError('');

    try {
      // Applique ce medecin aux gardes futures de la meme case du roulement.
      //
      // Depuis 6C-3, cette action ne CREE plus de regle de roulement : elle
      // n'agit que sur des gardes. Le plan vient du fichier valide et
      // l'application ne l'ecrit jamais (principe de source unique, MOD-1).
      // C'est precisement cette ecriture qui avait fait diverger la base du
      // fichier -- 41 regles modifiees et 24 ajoutees en sept mois.
      const plans = await getRotationPlans();
      const plan = getPlanForDate(new Date(shift.date), plans);
      if (!plan) {
        setError('Aucun plan de roulement ne couvre cette date');
        setLoading(false);
        return;
      }

      const { rotationWeek: currentRotationWeek, weekday: currentWeekday } = getRotationSlot(
        new Date(shift.date),
        plan,
        { componentName: 'ShiftDetailModal.handleApplyToRotationWeek', inputOrigin: `shift.date: "${shift.date}"` }
      );

      // ⚠ Bornage au PRESENT (03/08/2026) -- il manquait, alors que le
      // commentaire ci-dessus annonce « les gardes futures ». Sans lui, la
      // requete ramassait tout l'historique : 125 gardes passees sont encore
      // `free` ou `pending` en base (du 29/12/2025 au 31/07/2026). Signale par
      // Matthieu, qui voyait un conflit annonce sur le 30/12/2025 en assignant
      // une garde de 2027.
      const aujourdhui = new Date().toISOString().split('T')[0];

      const { data: allShifts, error: fetchError } = await supabase
        .from('shifts')
        .select('id, date, status, assigned_doctor_id')
        .eq('site_id', shift.site_id)
        .eq('room_id', shift.room_id)
        .eq('shift_type_id', shift.shift_type_id)
        .neq('id', shift.id)
        .gte('date', aujourdhui)
        .in('status', ['free', 'pending']);

      if (fetchError) throw fetchError;

      if (allShifts && allShifts.length > 0) {
        const matchingShifts = allShifts.filter(s => {
          // Meme precaution que dans findRotationSlotShifts : une garde regie
          // par un autre plan n'est pas dans la meme case.
          const sPlan = getPlanForDate(new Date(s.date), plans);
          if (!sPlan || sPlan.id !== plan.id) return false;

          const { rotationWeek: shiftRotationWeek, weekday: shiftWeekday } = getRotationSlot(
            new Date(s.date),
            sPlan,
            { componentName: 'ShiftDetailModal.handleApplyToRotationWeek(filter)', inputOrigin: `s.date: "${s.date}"` }
          );
          return shiftRotationWeek === currentRotationWeek && shiftWeekday === currentWeekday;
        });

        if (matchingShifts.length > 0) {
          const shiftIds = matchingShifts.map(s => s.id);

          const { error: updateError } = await supabase
            .from('shifts')
            .update({
              status: 'assigned',
              assigned_doctor_id: shift.assigned_doctor_id,
              updated_at: new Date().toISOString()
            })
            .in('id', shiftIds);

          if (updateError) throw updateError;

          const { error: rejectError } = await supabase
            .from('requests')
            .update({
              status: 'rejected',
              reviewed_at: new Date().toISOString(),
              rejection_note: 'Assignation automatique via application à la semaine de roulement'
            })
            .in('shift_id', shiftIds)
            .eq('status', 'pending');

          if (rejectError) throw rejectError;
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    // etat affiche
    loading,
    error,
    rotationInfo,
    hasRotationRule,
    rotationCancelCount,
    seriesCancelCount,
    pendingRequests,
    isPartOfSeries,
    // flags des modales
    showSeriesModal,
    seriesAction,
    showEditSeriesModal,
    showValidatedConfirm,
    showCancelAssignmentModal,
    showApplyToRotationWeekConfirm,
    showDeletionBlockedModal,
    showDeleteConfirm,
    showFreeShiftConfirm,
    showConflictError,
    conflictErrorMessage,
    // setters utilises par le rendu (ouverture / fermeture des modales)
    setShowSeriesModal,
    setSeriesAction,
    setShowEditSeriesModal,
    setShowValidatedConfirm,
    setPendingActionRequest,
    setShowCancelAssignmentModal,
    setShowApplyToRotationWeekConfirm,
    setShowDeletionBlockedModal,
    setShowDeleteConfirm,
    setShowFreeShiftConfirm,
    setShowConflictError,
    setConflictErrorMessage,
    // actions
    handleApproveClick,
    handleDelete,
    handleSetOnHoldClick,
    handleRemovePrevalidation,
    handleValidatedConfirm,
    handleDeleteClick,
    handleSeriesActionSelect,
    handleCancelAssignmentClick,
    handleCancelAssignment,
    handleApplyToRotationWeek,
  };
}
