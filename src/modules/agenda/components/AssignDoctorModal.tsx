import { useState, useEffect } from 'react';
import { supabase, Shift } from '../lib/supabase';
import { Repeat } from 'lucide-react';
import { getRotationSettings, getRotationWeek } from '../lib/rotationUtils';
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
      const settings = await getRotationSettings();
      if (settings) {
        const shiftDate = new Date(shift.date);
        const week = getRotationWeek(
          shiftDate,
          settings,
          { componentName: 'AssignDoctorModal.loadRotationInfo', inputOrigin: `shift.date: "${shift.date}"` }
        );
        setRotationInfo({ week, total: settings.cycle_length_weeks });
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
      const settings = await getRotationSettings();
      if (!settings) {
        setError('Paramètres de roulement non configurés');
        setLoading(false);
        return;
      }

      const currentDate = new Date(shift.date);
      const currentRotationWeek = getRotationWeek(
        currentDate,
        settings,
        { componentName: 'AssignDoctorModal.handleApplyToRotation', inputOrigin: `shift.date: "${shift.date}"` }
      );
      const currentWeekday = currentDate.getDay();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non authentifié');

      const { error: ruleError } = await supabase
        .from('rotation_assignment_rules')
        .upsert({
          doctor_id: selectedDoctorId,
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
          const shiftDate = new Date(s.date);
          const shiftRotationWeek = getRotationWeek(
            shiftDate,
            settings,
            { componentName: 'AssignDoctorModal.handleApplyToRotation(filter)', inputOrigin: `s.date: "${s.date}"` }
          );
          const shiftWeekday = shiftDate.getDay();
          return shiftRotationWeek === currentRotationWeek && shiftWeekday === currentWeekday;
        });

        if (matchingShifts.length > 0) {
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
      <BottomSheet title="Appliquer au roulement ?" onClose={onClose} busy={loading}>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-pill bg-canard/10 p-2">
            <Repeat className="h-5 w-5 text-canard" />
          </div>
          <p className="text-body-m text-ink">
            Voulez-vous appliquer ce médecin à toutes les gardes correspondantes de la même
            semaine de roulement (même jour, même site, même salle, même horaire) ?
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 p-3">
            <p className="text-body-m text-brique">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleOnlyThisShift}
            disabled={loading}
            className="w-full rounded-input border border-border px-4 py-3 text-button text-marine transition-colors hover:bg-fond disabled:opacity-50"
          >
            Assigner seulement cette garde
          </button>
          <button
            onClick={handleApplyToRotation}
            disabled={loading}
            className="w-full rounded-input bg-marine px-4 py-3 text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {loading ? 'Application…' : 'Assigner pour la semaine de roulement'}
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
