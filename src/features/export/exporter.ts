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

/** Sauvegarde complète : toutes les tables, au format JSON. */
export async function exportAllDataAsJson(db: SQLiteDatabase): Promise<void> {
  const [categories, transactions, budgets, savingsGoals, savingsEntries, bills, billPayments] =
    await Promise.all([
      db.getAllAsync('SELECT * FROM categories ORDER BY id'),
      db.getAllAsync('SELECT * FROM transactions ORDER BY id'),
      db.getAllAsync('SELECT * FROM budgets ORDER BY id'),
      db.getAllAsync('SELECT * FROM savings_goals ORDER BY id'),
      db.getAllAsync('SELECT * FROM savings_entries ORDER BY id'),
      db.getAllAsync('SELECT * FROM bills ORDER BY id'),
      db.getAllAsync('SELECT * FROM bill_payments ORDER BY id'),
    ]);

  const payload = {
    app: 'Mes Budgets',
    format: 1,
    exported_at: new Date().toISOString(),
    data: {
      categories,
      transactions,
      budgets,
      savings_goals: savingsGoals,
      savings_entries: savingsEntries,
      bills,
      bill_payments: billPayments,
    },
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

/** Transactions au format CSV (séparateur « ; », montants en euros, virgule décimale) — s'ouvre directement dans Excel/Numbers. */
export async function exportTransactionsAsCsv(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{
    date: string;
    type: string;
    category: string | null;
    label: string;
    amount_cents: number;
    note: string | null;
  }>(
    `SELECT t.date, t.type, c.name AS category, t.label, t.amount_cents, t.note
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     ORDER BY t.date, t.id`,
  );

  const header = 'date;type;categorie;libelle;montant_eur;note';
  const lines = rows.map((row) =>
    [
      row.date,
      row.type === 'income' ? 'revenu' : 'depense',
      csvEscape(row.category ?? ''),
      csvEscape(row.label),
      (row.amount_cents / 100).toFixed(2).replace('.', ','),
      csvEscape(row.note ?? ''),
    ].join(';'),
  );

  // BOM UTF-8 pour qu'Excel reconnaisse les accents
  await shareFile(
    `mes-budgets-transactions-${todayIso()}.csv`,
    '\uFEFF' + [header, ...lines].join('\n'),
    'text/csv',
  );
}
