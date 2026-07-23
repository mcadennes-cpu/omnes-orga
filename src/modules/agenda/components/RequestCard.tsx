import { useState } from 'react';
import { Request } from '../lib/supabase';
import { Check, X, Calendar, MapPin, Clock, User } from 'lucide-react';
import RejectReasonModal from './RejectReasonModal';

type RequestCardProps = {
  request: Request;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string, note?: string) => Promise<void>;
};

export default function RequestCard({ request, onApprove, onReject }: RequestCardProps) {
  const [loading, setLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(date);
  };

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffHours < 1) {
      return `Il y a ${diffMins} min`;
    } else if (diffHours < 24) {
      return `Il y a ${diffHours}h`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `Il y a ${diffDays}j`;
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    await onApprove(request.id);
    setLoading(false);
  };

  const handleReject = async (note?: string) => {
    setLoading(true);
    await onReject(request.id, note);
    setLoading(false);
    setShowRejectModal(false);
  };

  return (
    <>
      <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-gray-900">
                {request.doctor?.full_name}
              </h3>
              <p className="text-sm text-gray-500">{request.doctor?.email}</p>
            </div>
          </div>
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {getRelativeTime(request.requested_at)}
          </span>
        </div>

        {request.shift && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{formatDate(request.shift.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{request.shift.location} • {request.shift.room}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{request.shift.shift_type}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check className="w-5 h-5" />
            APPROUVER
          </button>
          <button
            onClick={() => setShowRejectModal(true)}
            disabled={loading}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
            REFUSER
          </button>
        </div>
      </div>

      {showRejectModal && (
        <RejectReasonModal
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}
    </>
  );
}
