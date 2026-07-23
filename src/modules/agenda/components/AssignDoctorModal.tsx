import { useState, useEffect } from 'react';
import { supabase, Shift } from '../lib/supabase';
import { X, UserPlus, Repeat } from 'lucide-react';
import { getRotationSettings, getRotationWeek } from '../lib/rotationUtils';
import { checkDoctorDailyConflict } from '../lib/shiftValidation';
import ConflictErrorModal from './ConflictErrorModal';

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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Repeat className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">Appliquer au roulement ?</h2>
            </div>
          </div>

          <p className="text-gray-700 mb-6">
            Voulez-vous appliquer ce médecin à toutes les gardes correspondantes de la même semaine de roulement (même jour, même site, même salle, même horaire) ?
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleOnlyThisShift}
              disabled={loading}
              className="w-full px-4 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Assigner seulement cette garde
            </button>
            <button
              onClick={handleApplyToRotation}
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Application...' : 'Assigner pour la semaine de roulement'}
            </button>
            <button
              onClick={handleCancelAssignment}
              disabled={loading}
              className="w-full px-4 py-3 border-2 border-red-300 text-red-700 font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <UserPlus className="w-6 h-6 text-teal-600" />
            <h2 className="text-xl font-bold text-teal-900">Assigner un médecin</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="space-y-4">
          {shift.status === 'pending' && pendingRequesters.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Médecins ayant demandé cette garde
              </label>
              <div className="space-y-2 mb-4">
                {pendingRequesters.map((doctor) => (
                  <button
                    key={doctor.id}
                    onClick={() => setSelectedDoctorId(doctor.id)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedDoctorId === doctor.id
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-gray-200 hover:border-teal-300 bg-white'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{doctor.full_name}</div>
                    <div className="text-sm text-gray-600">{doctor.email}</div>
                    <div className="text-xs text-gray-500 mt-1">
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
              <div className="text-sm text-gray-600 mb-2">Ou choisir un autre médecin :</div>
            </div>
          )}
          <div>
            {!(shift.status === 'pending' && pendingRequesters.length > 0) && (
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sélectionner un médecin
              </label>
            )}
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleAssign}
              disabled={loading || !selectedDoctorId}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Assignation...' : 'Confirmer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
