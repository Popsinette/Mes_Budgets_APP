import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { buildBackup, markBackupDone } from '@/src/features/backup/repository';
import { todayIso } from '@/src/utils/dates';

/**
 * Export des données via la feuille de partage du système (AirDrop, Fichiers,
 * mail…). Le fichier est écrit en clair dans le cache le temps du partage :
 * c'est un déchiffrement volontaire, déclenché uniquement par l'utilisateur.
 *
 * Sur le web (PWA), on passe par la feuille de partage du navigateur quand
 * elle accepte les fichiers (Safari iOS), sinon par un téléchargement direct.
 */

/** Partage le fichier ; renvoie false si l'utilisateur a annulé. */
async function shareFile(fileName: string, content: string, mimeType: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const webFile = new globalThis.File([blob], fileName, { type: mimeType });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [webFile] })) {
      try {
        await navigator.share({ files: [webFile], title: fileName });
        return true;
      } catch (error) {
        // Partage annulé par l'utilisateur : ne pas déclencher le téléchargement.
        if (error instanceof Error && error.name === 'AbortError') return false;
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
    return true;
  }

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Exporter mes données' });
  return true;
}

/** Sauvegarde complète : toutes les tables, au format JSON (relisible par « Restaurer »). */
export async function exportAllDataAsJson(db: SQLiteDatabase): Promise<void> {
  const backup = await buildBackup(db);
  const shared = await shareFile(`mes-budgets-${todayIso()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  if (shared) await markBackupDone(db, backup.exported_at);
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
