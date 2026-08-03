import { useState, useEffect } from 'react';
import { supabase, Shift } from '../lib/supabase';
import { Repeat } from 'lucide-react';
import {
  getRotationPlans,
  getPlanForDate,
  getRotationWeek,
  getRotationSlot,
} from '../lib/rotationUtils';
import { checkDoctorDailyConflict } from '../lib/shiftValidation';
import ConflictErrorModal from './ConflictErrorModal';
import BottomSheet from './ui/BottomSheet';

type Doctor = {
  id: string;
  full_name: string;
  email: string;
  hasRequest?: boolean;
  requestedAt?: string;
};

type AssignDoctorModalProps = {
  shift: Shift;
  onClose: () => void;
  onSuccess: () => void;
  isCoordinator?: boolean;
};

export default function AssignDoctorModal({ shift, onClose, onSuccess, isCoordinator = false }: AssignDoctorModalProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [pendingRequesters, setPendingRequesters] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showRotationPrompt, setShowRotationPrompt] = useState(false);
  const [assignedShiftId, setAssignedShiftId] = useState<string | null>(null);
  const [rotationInfo, setRotationInfo] = useState<{ week: number; total: number } | null>(null);
  const [showConflictError, setShowConflictError] = useState(false);
  const [conflictErrorMessage, setConflictErrorMessage] = useState('');

  useEffect(() => {
    loadDoctors();
    loadRotationInfo();
    if (shift.status === 'pending') {
      loadPendingRequesters();
    }
  }, []);

  const loadRotationInfo = async () => {
    try {
      const plan = getPlanForDate(new Date(shift.date), await getRotationPlans());
      if (plan) {
        const shiftDate = new Date(shift.date);
        const week = getRotationWeek(
          shiftDate,
          plan,
          { componentName: 'AssignDoctorModal.loadRotationInfo', inputOrigin: `shift.date: "${shift.date}"` }
        );
        setRotationInfo({ week, total: plan.cycle_length_weeks });
      }
    } catch (error) {
      console.error('Error loading rotation info:', error);
    }
  };

  const loadDoctors = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'doctor')
      .order('full_name', { ascending: true });

    if (!error && data) {
      setDoctors(data);
    }
  };

  const loadPendingRequesters = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select(`
        doctor_id,
        requested_at,
        doctor:profiles!doctor_id(id, full_name, email)
      `)
      .eq('shift_id', shift.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (!error && data) {
      const requesters = data.map(req => ({
        id: req.doctor.id,
        full_name: req.doctor.full_name,
        email: req.doctor.email,
        hasRequest: true,
        requestedAt: req.requested_at
      }));
      setPendingRequesters(requesters as Doctor[]);
    }
  };

  const handleAssign = async () => {
    if (!selectedDoctorId) {
      setError('Veuillez sélectionner un médecin');
      return;
    }

    setLoading(true);
    setError('');

    const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
    const validation = await checkDoctorDailyConflict(
      selectedDoctorId,
      shift.date,
      shift.id,
      selectedDoctor?.full_name
    );

    if (!validation.isValid) {
      setConflictErrorMessage(validation.errorMessage || 'Ce médecin a déjà une garde ce jour-là.');
      setShowConflictError(true);
      setLoading(false);
      return;
    }

    try {
      const { error: shiftError } = await supabase
        .from('shifts')
        .update({
          status: 'assigned',
          assigned_doctor_id: selectedDoctorId,
          updated_at: new Date().toISOString()
        })
        .eq('id', shift.id);

      if (shiftError) throw shiftError;

      const { error: rejectError } = await supabase
        .from('requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          rejection_note: 'Un autre médecin a été assigné directement par le coordinateur'
        })
        .eq('shift_id', shift.id)
        .eq('status', 'pending');

      if (rejectError) throw rejectError;

      setAssignedShiftId(shift.id);

      if (isCoordinator && rotationInfo) {
        setShowRotationPrompt(true);
        setLoading(false);
      } else {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleOnlyThisShift = () => {
    onSuccess();
    onClose();
  };

  const handleApplyToRotation = async () => {
    setLoading(true);
    setError('');

    try {
      // Applique le medecin aux gardes futures de la meme case du roulement.
      // Depuis 6C-3, ne cree plus de regle : le plan vient du fichier valide
      // et l'application ne l'ecrit jamais (source unique, MOD-1).
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
        { componentName: 'AssignDoctorModal.handleApplyToRotation', inputOrigin: `shift.date: "${shift.date}"` }
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

      if (!allShifts || allShifts.length === 0) {
        // La garde de depart est deja assignee par handleAssign : il n'y a
        // simplement rien d'autre a propager. Le dire, plutot que de fermer
        // sans un mot -- on croirait le bouton sans effet.
        setInfo('Aucune autre garde à venir ne correspond à cette case du roulement.');
        setLoading(false);
        return;
      }

      {
        const matchingShifts = allShifts.filter(s => {
          // Une garde regie par un autre plan n'est pas dans la meme case.
          const sPlan = getPlanForDate(new Date(s.date), plans);
          if (!sPlan || sPlan.id !== plan.id) return false;

          const { rotationWeek: shiftRotationWeek, weekday: shiftWeekday } = getRotationSlot(
            new Date(s.date),
            sPlan,
            { componentName: 'AssignDoctorModal.handleApplyToRotation(filter)', inputOrigin: `s.date: "${s.date}"` }
          );
          return shiftRotationWeek === currentRotationWeek && shiftWeekday === currentWeekday;
        });

        if (matchingShifts.length === 0) {
          setInfo('Aucune autre garde à venir ne correspond à cette case du roulement.');
          setLoading(false);
          return;
        }

        {
          const validShiftIds: string[] = [];
          const conflictDates: string[] = [];

          for (const matchingShift of matchingShifts) {
            const validation = await checkDoctorDailyConflict(
              selectedDoctorId,
              matchingShift.date,
              matchingShift.id
            );

            if (validation.isValid) {
              validShiftIds.push(matchingShift.id);
            } else {
              conflictDates.push(new Date(matchingShift.date).toLocaleDateString('fr-FR'));
            }
          }

          if (conflictDates.length > 0) {
            const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
            const doctorName = selectedDoctor?.full_name || 'Ce médecin';
            setError(`${doctorName} a déjà des gardes assignées pour : ${conflictDates.join(', ')}. Ces dates ont été ignorées.`);
          }

          if (validShiftIds.length > 0) {
            const { error: updateError } = await supabase
              .from('shifts')
              .update({
                status: 'assigned',
                assigned_doctor_id: selectedDoctorId,
                updated_at: new Date().toISOString()
              })
              .in('id', validShiftIds);

            if (updateError) throw updateError;

            const { error: rejectError } = await supabase
              .from('requests')
              .update({
                status: 'rejected',
                reviewed_at: new Date().toISOString(),
                rejection_note: 'Assignation automatique via application à la semaine de roulement'
              })
              .in('shift_id', validShiftIds)
              .eq('status', 'pending');

            if (rejectError) throw rejectError;
          } else if (conflictDates.length > 0) {
            setLoading(false);
            return;
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleCancelAssignment = async () => {
    if (!assignedShiftId) {
      onClose();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: rollbackError } = await supabase
        .from('shifts')
        .update({
          status: 'free',
          assigned_doctor_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignedShiftId);

      if (rollbackError) throw rollbackError;

      const { error: restoreError } = await supabase
        .from('requests')
        .update({
          status: 'pending',
          reviewed_at: null,
          rejection_note: null
        })
        .eq('shift_id', assignedShiftId)
        .eq('status', 'rejected');

      if (restoreError) throw restoreError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (showRotationPrompt) {
    return (
      <BottomSheet title="Appliquer aux gardes du roulement ?" onClose={onClose} busy={loading}>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-pill bg-canard/10 p-2">
            <Repeat className="h-5 w-5 text-canard" />
          </div>
          <p className="text-body-m text-ink">
            Voulez-vous appliquer ce médecin à toutes les gardes correspondantes de la même
            semaine de roulement (même jour, même site, même salle, même horaire) ?
            <span className="mt-2 block text-caption">
              Le roulement lui-même n'est pas modifié : il vient du fichier de roulement
              validé. Pour un changement durable, il faut passer par ce fichier.
            </span>
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 p-3">
            <p className="text-body-m text-brique">{error}</p>
          </div>
        )}

        {/* Message neutre, distinct de l'erreur : « rien a propager » n'est pas
            un echec -- la garde de depart est bien assignee. */}
        {info && (
          <div className="mb-4 rounded-input border border-marine/20 bg-marine/5 p-3">
            <p className="text-body-m text-ink">{info}</p>
            <p className="mt-1 text-caption">
              La garde du {new Date(shift.date).toLocaleDateString('fr-FR')} est bien
              assignée.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleOnlyThisShift}
            disabled={loading}
            className="w-full rounded-input border border-border px-4 py-3 text-button text-marine transition-colors hover:bg-fond disabled:opacity-50"
          >
            {info ? 'Terminer' : 'Assigner seulement cette garde'}
          </button>
          <button
            onClick={handleApplyToRotation}
            disabled={loading}
            className="w-full rounded-input bg-marine px-4 py-3 text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {loading ? 'Application…' : 'Assigner sur toute la semaine de roulement'}
          </button>
          <button
            onClick={handleCancelAssignment}
            disabled={loading}
            className="w-full rounded-input border border-brique/30 px-4 py-3 text-button text-brique transition-colors hover:bg-brique/5 disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </BottomSheet>
    );
  }

  if (showConflictError) {
    return (
      <ConflictErrorModal
        onClose={() => {
          setShowConflictError(false);
          setConflictErrorMessage('');
        }}
        errorMessage={conflictErrorMessage}
      />
    );
  }

  return (
    <BottomSheet
      title="Assigner un médecin"
      onClose={onClose}
      busy={loading}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleAssign}
            disabled={loading || !selectedDoctorId}
            className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {loading ? 'Assignation…' : 'Confirmer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {shift.status === 'pending' && pendingRequesters.length > 0 && (
          <div>
            <label className="mb-3 block text-field-label">
              Médecins ayant demandé cette garde
            </label>
            <div className="mb-4 space-y-2">
              {pendingRequesters.map((doctor) => (
                <button
                  key={doctor.id}
                  onClick={() => setSelectedDoctorId(doctor.id)}
                  className={`w-full rounded-card border-2 p-3 text-left transition-all ${
                    selectedDoctorId === doctor.id
                      ? 'border-canard bg-canard/5'
                      : 'border-border bg-carte hover:border-canard/50'
                  }`}
                >
                  <div className="font-semibold text-ink">{doctor.full_name}</div>
                  <div className="text-caption">{doctor.email}</div>
                  <div className="mt-1 text-caption">
                    Demandé le {new Date(doctor.requestedAt!).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </button>
              ))}
            </div>
            <div className="mb-2 text-caption">Ou choisir un autre médecin :</div>
          </div>
        )}
        <div>
          {!(shift.status === 'pending' && pendingRequesters.length > 0) && (
            <label className="mb-2 block text-field-label">
              Sélectionner un médecin
            </label>
          )}
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className="w-full rounded-input border border-border bg-carte px-4 py-2 text-body-m text-ink focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30"
            disabled={loading}
          >
            <option value="">-- Choisir un médecin --</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name} ({doctor.email})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-input border border-brique/20 bg-brique/10 p-3">
            <p className="text-body-m text-brique">{error}</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
