import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { todayIso } from '@/src/utils/dates';

/**
 * Export des données via la feuille de partage du système (AirDrop, Fichiers,
 * mail…). Le fichier est écrit en clair dans le cache le temps du partage :
 * c'est un déchiffrement volontaire, déclenché uniquement par l'utilisateur.
 *
 * Sur le web (PWA), on passe par la feuille de partage du navigateur quand
 * elle accepte les fichiers (Safari iOS), sinon par un téléchargement direct.
 */

async function shareFile(fileName: string, content: string, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const webFile = new globalThis.File([blob], fileName, { type: mimeType });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [webFile] })) {
      try {
        await navigator.share({ files: [webFile], title: fileName });
        return;
      } catch (error) {
        // Partage annulé par l'utilisateur : ne pas déclencher le téléchargement.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Exporter mes données' });
}

const TABLES = [
  'envelopes',
  'expenses',
  'fixed_items',
  'fixed_checks',
  'savings_pots',
  'savings_moves',
  'week_closures',
  'health_expenses',
  'account',
] as const;

/** Sauvegarde complète : toutes les tables, au format JSON. */
export async function exportAllDataAsJson(db: SQLiteDatabase): Promise<void> {
  const rows = await Promise.all(TABLES.map((table) => db.getAllAsync(`SELECT * FROM ${table}`)));
  const payload = {
    app: 'Mes Budgets',
    format: 2,
    exported_at: new Date().toISOString(),
    data: Object.fromEntries(TABLES.map((table, i) => [table, rows[i]])),
  };

  await shareFile(
    `mes-budgets-${todayIso()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Dépenses au format CSV (séparateur « ; », montants en euros, virgule décimale) — s'ouvre directement dans Excel/Numbers. */
export async function exportExpensesAsCsv(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ date: string; envelope: string; label: string; amount_cents: number }>(
    `SELECT x.date, e.name AS envelope, x.label, x.amount_cents
     FROM expenses x JOIN envelopes e ON e.id = x.envelope_id
     ORDER BY x.date, x.id`,
  );

  const header = 'date;enveloppe;libelle;montant_eur';
  const lines = rows.map((row) =>
    [
      row.date,
      csvEscape(row.envelope),
      csvEscape(row.label),
      (row.amount_cents / 100).toFixed(2).replace('.', ','),
    ].join(';'),
  );

  // BOM UTF-8 pour qu'Excel reconnaisse les accents
  await shareFile(
    `mes-budgets-depenses-${todayIso()}.csv`,
    '\uFEFF' + [header, ...lines].join('\n'),
    'text/csv',
  );
}
