import { useState } from 'react';
import { Download } from 'lucide-react';
import { exportPlanningToCSV, exportPlanningMatrixToCSV } from '../lib/exportUtils';
import BottomSheet from './ui/BottomSheet';

type ExportPlanningModalProps = {
  onClose: () => void;
};

type ExportFormat = 'list' | 'matrix';

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

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
    <BottomSheet
      title="Exporter le planning"
      onClose={onClose}
      busy={isExporting}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:cursor-not-allowed disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Export…</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>Exporter</span>
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-field-label">Format d'export</label>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            className={fieldClass}
          >
            <option value="list">Liste classique</option>
            <option value="matrix">Matrice (Tableau)</option>
          </select>
          {exportFormat === 'matrix' && (
            <p className="mt-1 text-caption">
              Export en format tableau : salles en lignes, jours en colonnes
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-field-label">
            Date de début <span className="text-brique">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-field-label">
            Date de fin <span className="text-brique">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={fieldClass}
          />
        </div>

        {exportFormat === 'list' && (
          <>
            <div>
              <label className="mb-1 block text-field-label">Site</label>
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value as 'all' | 'Dijon' | 'Beaune')}
                className={fieldClass}
              >
                <option value="all">Tous</option>
                <option value="Dijon">Dijon</option>
                <option value="Beaune">Beaune</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeFreeShifts}
                  onChange={(e) => setIncludeFreeShifts(e.target.checked)}
                  className="h-4 w-4 accent-canard"
                />
                <span className="text-body-m text-ink">Inclure les gardes libres</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeAssignedShifts}
                  onChange={(e) => setIncludeAssignedShifts(e.target.checked)}
                  className="h-4 w-4 accent-canard"
                />
                <span className="text-body-m text-ink">Inclure les gardes assignées</span>
              </label>
            </div>
          </>
        )}

        {error && (
          <div className="rounded-input border border-brique/20 bg-brique/10 p-3 text-body-m text-brique">
            {error}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
