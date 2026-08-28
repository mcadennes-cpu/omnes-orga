import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { exportPlanningToCSV } from '../lib/exportUtils';
import { construirePlanningImprimable } from '../lib/printPlanning';
import BottomSheet from './ui/BottomSheet';

type ExportPlanningModalProps = {
  onClose: () => void;
};

// « matrix » (CSV en tableau) a ete remplace par « print » en 8B-3 : le tableur
// n'en faisait rien de lisible, et le format melangeait un nombre de demandes
// avec des noms de medecins dans la meme colonne.
type ExportFormat = 'list' | 'print';

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

export default function ExportPlanningModal({ onClose }: ExportPlanningModalProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('print');
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

    // ⚠️ La fenêtre s'ouvre AVANT le chargement des données. Ouverte après un
    // `await`, elle serait bloquée comme une fenêtre publicitaire : le droit
    // d'en ouvrir une vient du clic, et il ne survit pas à l'attente réseau
    // (Safari est le plus strict). D'où ce découpage — la fenêtre d'abord, le
    // document ensuite.
    let fenetre: Window | null = null;
    if (exportFormat === 'print') {
      fenetre = window.open('', '_blank');
      if (!fenetre) {
        setError(
          "Le navigateur a bloqué l'ouverture de la fenêtre. Autorisez les fenêtres surgissantes pour ce site, puis réessayez."
        );
        return;
      }
      fenetre.document.write('<p style="font-family:sans-serif">Préparation du planning…</p>');
    }

    setIsExporting(true);

    try {
      if (exportFormat === 'print') {
        const result = await construirePlanningImprimable({ startDate, endDate });

        if (!result.success || !result.html) {
          fenetre?.close();
          setError(result.error || "Une erreur est survenue lors de la préparation.");
          return;
        }

        fenetre!.document.open();
        fenetre!.document.write(result.html);
        fenetre!.document.close();
        onClose();
        return;
      }

      const result = await exportPlanningToCSV({
        startDate,
        endDate,
        siteFilter,
        includeFreeShifts,
        includeAssignedShifts,
      });

      if (!result.success) {
        setError(result.error || 'Une erreur est survenue lors de l\'exportation.');
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Export error:', err);
      fenetre?.close();
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
                <span>{exportFormat === 'print' ? 'Préparation…' : 'Export…'}</span>
              </>
            ) : exportFormat === 'print' ? (
              <>
                <Printer className="h-4 w-4" />
                <span>Ouvrir</span>
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
            <option value="print">À imprimer</option>
            <option value="list">Liste (tableur)</option>
          </select>
          <p className="mt-1 text-caption">
            {exportFormat === 'print'
              ? "Le planning s'ouvre dans un nouvel onglet, à la disposition de la vue Semaine : salles en lignes, jours en colonnes. Noir et blanc, une semaine par page."
              : 'Un fichier CSV, une ligne par garde — pour retravailler les données dans un tableur.'}
          </p>
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
