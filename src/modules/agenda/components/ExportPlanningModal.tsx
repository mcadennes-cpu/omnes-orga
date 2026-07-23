import { useState } from 'react';
import { X, Download } from 'lucide-react';
import { exportPlanningToCSV, exportPlanningMatrixToCSV } from '../lib/exportUtils';

type ExportPlanningModalProps = {
  onClose: () => void;
};

type ExportFormat = 'list' | 'matrix';

export default function ExportPlanningModal({ onClose }: ExportPlanningModalProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('matrix');
  const [siteFilter, setSiteFilter] = useState<'all' | 'Dijon' | 'Beaune'>('all');
  const [includeFreeShifts, setIncludeFreeShifts] = useState(true);
  const [includeAssignedShifts, setIncludeAssignedShifts] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');

    if (!startDate || !endDate) {
      setError('Veuillez sélectionner une date de début et une date de fin.');
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setError('La date de fin doit être postérieure à la date de début.');
      return;
    }

    if (exportFormat === 'list' && !includeFreeShifts && !includeAssignedShifts) {
      setError('Veuillez sélectionner au moins un type de garde à exporter.');
      return;
    }

    setIsExporting(true);

    try {
      let result;

      if (exportFormat === 'matrix') {
        result = await exportPlanningMatrixToCSV({
          startDate,
          endDate,
        });
      } else {
        result = await exportPlanningToCSV({
          startDate,
          endDate,
          siteFilter,
          includeFreeShifts,
          includeAssignedShifts,
        });
      }

      if (!result.success) {
        setError(result.error || 'Une erreur est survenue lors de l\'exportation.');
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Export error:', err);
      setError('Une erreur inattendue est survenue.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-teal-900">Exporter le planning</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Format d'export
            </label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="list">Liste classique</option>
              <option value="matrix">Matrice (Tableau)</option>
            </select>
            {exportFormat === 'matrix' && (
              <p className="text-xs text-gray-500 mt-1">
                Export en format tableau : salles en lignes, jours en colonnes
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date de début <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date de fin <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {exportFormat === 'list' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Site
                </label>
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value as 'all' | 'Dijon' | 'Beaune')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="all">Tous</option>
                  <option value="Dijon">Dijon</option>
                  <option value="Beaune">Beaune</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFreeShifts}
                    onChange={(e) => setIncludeFreeShifts(e.target.checked)}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Inclure les gardes libres</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAssignedShifts}
                    onChange={(e) => setIncludeAssignedShifts(e.target.checked)}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Inclure les gardes assignées</span>
                </label>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Annuler
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Export...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Exporter</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
