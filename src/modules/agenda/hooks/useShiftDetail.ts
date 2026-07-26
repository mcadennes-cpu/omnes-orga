import { useEffect, useState } from 'react';
import { Shift, supabase } from '../lib/supabase';
import { getRotationSettings, getRotationWeek, getRotationSlot } from '../lib/rotationUtils';
import { saveUndoAction, getCurrentUserId } from '../lib/undoUtils';
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

export function useShiftDetail(shift: Shift, onSuccess: () => void, onClose: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showEditSeriesModal, setShowEditSeriesModal] = useState(false);
  const [showValidatedConfirm, setShowValidatedConfirm] = useState(false);
  const [showCancelAssignmentModal, setShowCancelAssignmentModal] = useState(false);
  const [showApplyToRotationWeekConfirm, setShowApplyToRotationWeekConfirm] = useState(false);
  const [showDeletionBlockedModal, setShowDeletionBlockedModal] = useState(false);
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
      const settings = await getRotationSettings();
      if (cancelled) return;

      if (settings) {
        const week = getRotationWeek(
          new Date(shift.date),
          settings,
          { componentName: 'ShiftDetailModal.loadRotationInfo', inputOrigin: `shift.date: "${shift.date}"` }
        );
        setRotationInfo({ week, total: settings.cycle_length_weeks });
      } else {
        setRotationInfo(null);
      }
    };

    const checkRotationRule = async () => {
      if (!shift.assigned_doctor_id) {
        if (!cancelled) setHasRotationRule(false);
        return;
      }

      const settings = await getRotationSettings();
      if (cancelled) return;

      if (!settings) {
        setHasRotationRule(false);
        return;
      }

      const shiftDate = new Date(shift.date);
      const rotationWeek = getRotationWeek(
        shiftDate,
        settings,
        { componentName: 'ShiftDetailModal.checkRotationRule', inputOrigin: `shift.date: "${shift.date}"` }
      );
      const weekday = shiftDate.getDay();

      const { data: rule } = await supabase
        .from('rotation_assignment_rules')
        .select('id')
        .eq('doctor_id', shift.assigned_doctor_id)
        .eq('site_id', shift.site_id)
        .eq('room_id', shift.room_id)
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
    setLoading(true);
    setError('');

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
          .from('shifts')
          .delete()
          .eq('series_id', shift.series_id);

        if (deleteError) throw deleteError;

        const { error: seriesDeleteError } = await supabase
          .from('fixed_duty_series')
          .delete()
          .eq('id', shift.series_id);

        if (seriesDeleteError) throw seriesDeleteError;
      } else {
        if (shift.status === 'assigned' || shift.status === 'pending') {
          setShowDeletionBlockedModal(true);
          setLoading(false);
          return;
        }

        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .eq('id', shift.id);

        if (deleteError) throw deleteError;
      }

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
      if (confirm('Êtes-vous sûr de vouloir supprimer cette garde ?')) {
        handleDelete('single');
      }
    }
  };

  const handleSeriesActionSelect = (scope: 'single' | 'series') => {
    if (seriesAction === 'delete') {
      handleDelete(scope);
    }
  };

  const handleCancelAssignmentClick = async () => {
    if (isPartOfSeries || hasRotationRule) {
      if (hasRotationRule) {
        // Avant d'ouvrir la modale, compter les gardes attribuees/demandees que
        // "Supprimer la regle de roulement" libererait, pour l'afficher en garde-fou.
        const { count } = await supabase
          .from('shifts')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', shift.site_id)
          .eq('room_id', shift.room_id)
          .eq('shift_type_id', shift.shift_type_id)
          .gte('date', shift.date)
          .in('status', ['assigned', 'pending']);
        setRotationCancelCount(count ?? null);
      }
      setShowCancelAssignmentModal(true);
    } else {
      if (confirm('Êtes-vous sûr de vouloir annuler cette assignation ? La garde redeviendra libre.')) {
        handleCancelAssignment('single');
      }
    }
  };

  const handleCancelAssignment = async (scope: 'single' | 'series' | 'rotation') => {
    setShowCancelAssignmentModal(false);
    setLoading(true);
    setError('');

    try {
      const userId = await getCurrentUserId();

      if (scope === 'rotation') {
        const settings = await getRotationSettings();
        if (!settings) {
          throw new Error('Paramètres de roulement non configurés');
        }

        const shiftDate = new Date(shift.date);
        const rotationWeek = getRotationWeek(
          shiftDate,
          settings,
          { componentName: 'ShiftDetailModal.handleDelete(rotation)', inputOrigin: `shift.date: "${shift.date}"` }
        );
        const weekday = shiftDate.getDay();

        const { error: deleteRuleError } = await supabase
          .from('rotation_assignment_rules')
          .delete()
          .eq('doctor_id', shift.assigned_doctor_id)
          .eq('site_id', shift.site_id)
          .eq('room_id', shift.room_id)
          .eq('shift_type_id', shift.shift_type_id)
          .eq('weekday', weekday)
          .eq('rotation_week', rotationWeek);

        if (deleteRuleError) throw deleteRuleError;

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
      } else if (scope === 'series' && shift.series_id) {
        const { error: updateError } = await supabase
          .from('shifts')
          .update({
            status: 'free',
            assigned_doctor_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('series_id', shift.series_id);

        if (updateError) throw updateError;
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

        if (userId) {
          await saveUndoAction(
            userId,
            'Annulation d\'assignation',
            {
              type: 'unassign_shift',
              shift_id: shift.id,
              previous_assigned_doctor_id: shift.assigned_doctor_id,
              previous_status: shift.status
            }
          );
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

  const handleApplyToRotationWeek = async () => {
    setShowApplyToRotationWeekConfirm(false);
    setLoading(true);
    setError('');

    try {
      const settings = await getRotationSettings();
      if (!settings) {
        setError('Paramètres de roulement non configurés');
        setLoading(false);
        return;
      }

      const { rotationWeek: currentRotationWeek, weekday: currentWeekday } = getRotationSlot(
        new Date(shift.date),
        settings,
        { componentName: 'ShiftDetailModal.handleApplyToRotationWeek', inputOrigin: `shift.date: "${shift.date}"` }
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non authentifié');

      const { error: ruleError } = await supabase
        .from('rotation_assignment_rules')
        .upsert({
          doctor_id: shift.assigned_doctor_id,
          site_id: shift.site_id,
          room_id: shift.room_id,
          shift_type_id: shift.shift_type_id,
          weekday: currentWeekday,
          rotation_week: currentRotationWeek,
          created_by: user.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'site_id,room_id,shift_type_id,weekday,rotation_week'
        });

      if (ruleError) throw ruleError;

      const { data: allShifts, error: fetchError } = await supabase
        .from('shifts')
        .select('id, date, status, assigned_doctor_id')
        .eq('site_id', shift.site_id)
        .eq('room_id', shift.room_id)
        .eq('shift_type_id', shift.shift_type_id)
        .neq('id', shift.id)
        .in('status', ['free', 'pending']);

      if (fetchError) throw fetchError;

      if (allShifts && allShifts.length > 0) {
        const matchingShifts = allShifts.filter(s => {
          const { rotationWeek: shiftRotationWeek, weekday: shiftWeekday } = getRotationSlot(
            new Date(s.date),
            settings,
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
    setShowConflictError,
    setConflictErrorMessage,
    // actions
    handleApproveClick,
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
