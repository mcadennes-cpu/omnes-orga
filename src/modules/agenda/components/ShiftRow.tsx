import { Shift, UserRole } from '../lib/supabase';

type ShiftRowProps = {
  shift: Shift;
  userRole: UserRole;
  onClick: () => void;
  formatDate: (date: string) => string;
  getStatusBadge: (status: string) => JSX.Element;
};

export default function ShiftRow({ shift, userRole, onClick, formatDate, getStatusBadge }: ShiftRowProps) {
  const isClickable = userRole === 'doctor' && shift.status === 'free';

  return (
    <tr
      onClick={onClick}
      className={`
        ${isClickable ? 'cursor-pointer hover:bg-green-50 transition-colors' : ''}
        ${shift.status === 'free' ? 'bg-green-50/30' : ''}
        ${shift.status === 'pending' ? 'bg-yellow-50/50' : ''}
      `}
    >
      <td className="px-4 py-4 text-sm font-medium text-gray-900">
        {formatDate(shift.date)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-700">
        {shift.location}
      </td>
      <td className="px-4 py-4 text-sm text-gray-700">
        {shift.room}
      </td>
      <td className="px-4 py-4 text-sm text-gray-700">
        {shift.shift_type_data?.name || shift.shift_type}
      </td>
      <td className="px-4 py-4">
        {getStatusBadge(shift.status)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-700">
        {shift.assigned_doctor?.full_name || '-'}
      </td>
    </tr>
  );
}
