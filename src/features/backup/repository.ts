import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';

/**
 * Sauvegarde complète (JSON) et restauration.
 *
 * Les tables sont listées dans l'ordre des dépendances : on insère les
 * parents avant les enfants, on vide dans l'ordre inverse. `app_meta`
 * (date de dernière sauvegarde, mois clôturés…) n'est pas exportée.
 */
export const BACKUP_TABLES = [
  'envelope_templates',
  'envelope_months_ready',
  'envelopes',
  'expenses',
  'fixed_items',
  'fixed_checks',
  'savings_pots',
  'savings_moves',
  'savings_skips',
  'month_closures',
  'week_closures',
  'health_expenses',
  'account',
] as const;

export const BACKUP_APP = 'Mes Budgets';
/** 3 : ajout de savings_skips (V15) et month_closures / adjust_cents (V16). */
export const BACKUP_FORMAT = 3;

export type Backup = {
  app: string;
  format: number;
  exported_at: string;
  data: Partial<Record<(typeof BACKUP_TABLES)[number], Array<Record<string, unknown>>>>;
};

export async function buildBackup(db: SQLiteDatabase): Promise<Backup> {
  const rows = await Promise.all(
    BACKUP_TABLES.map((table) => db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`)),
  );
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exported_at: new Date().toISOString(),
    data: Object.fromEntries(BACKUP_TABLES.map((table, i) => [table, rows[i]])),
  };
}

/** Lit et vérifie un fichier de sauvegarde. Lève une erreur lisible sinon. */
export function parseBackup(text: string): Backup {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde lisible (JSON invalide).');
  }
  const p = payload as Partial<Backup> | null;
  if (!p || typeof p !== 'object' || p.app !== BACKUP_APP || !p.data || typeof p.data !== 'object') {
    throw new Error('Ce fichier n’est pas une sauvegarde Mes Budgets.');
  }
  // Les sauvegardes d'avant les enveloppes propres à chaque mois (format 1)
  // n'ont pas la même structure : on ne sait pas les relire sans risque.
  if (!Array.isArray(p.data.envelope_templates) || !Array.isArray(p.data.envelopes)) {
    throw new Error('Cette sauvegarde vient d’une ancienne version de l’app et ne peut pas être restaurée.');
  }
  for (const table of BACKUP_TABLES) {
    const rows = p.data[table];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Sauvegarde abîmée (table ${table}).`);
  }
  return p as Backup;
}

export type BackupStats = { expenses: number; envelopes: number; pots: number; fixed: number; exportedAt: string };

export function backupStats(backup: Backup): BackupStats {
  return {
    expenses: backup.data.expenses?.length ?? 0,
    envelopes: backup.data.envelopes?.length ?? 0,
    pots: backup.data.savings_pots?.length ?? 0,
    fixed: backup.data.fixed_items?.length ?? 0,
    exportedAt: backup.exported_at,
  };
}

/**
 * Remplace TOUTES les données par celles de la sauvegarde, en une transaction
 * (tout ou rien : en cas d'erreur, les données actuelles restent intactes).
 * Seules les colonnes connues de la base actuelle sont reprises ; une colonne
 * absente d'une ancienne sauvegarde prend sa valeur par défaut.
 */
export async function restoreBackup(db: SQLiteDatabase, backup: Backup): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of [...BACKUP_TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const table of BACKUP_TABLES) {
      const rows = backup.data[table] ?? [];
      if (rows.length === 0) continue;
      const columns = new Set(
        (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name),
      );
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => columns.has(k));
        if (keys.length === 0) continue;
        await db.runAsync(
          `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((k) => toSqlValue(row[k])),
        );
      }
    }
    await setMeta(db, LAST_BACKUP_KEY, backup.exported_at);
  });
  invalidateQueries();
}

function toSqlValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}

// ---------- Rappel de sauvegarde ----------

const LAST_BACKUP_KEY = 'last_backup_at';
/** Au-delà, l'Analyse et les Réglages rappellent de sauvegarder. */
export const BACKUP_REMINDER_DAYS = 30;

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string | null): Promise<void> {
  if (value === null) await db.runAsync('DELETE FROM app_meta WHERE key = ?', [key]);
  else await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [key, value]);
}

export async function markBackupDone(db: SQLiteDatabase, at: string = new Date().toISOString()): Promise<void> {
  await setMeta(db, LAST_BACKUP_KEY, at);
  invalidateQueries();
}

export type BackupStatus = {
  /** Date ISO de la dernière sauvegarde (ou de celle restaurée), null si jamais. */
  last_at: string | null;
  /** Jours écoulés depuis (null si jamais). */
  days: number | null;
  /** Il y a des données à protéger et pas de sauvegarde récente. */
  due: boolean;
};

export async function getBackupStatus(db: SQLiteDatabase, now: Date = new Date()): Promise<BackupStatus> {
  const [last, used] = await Promise.all([
    getMeta(db, LAST_BACKUP_KEY),
    db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM expenses) + (SELECT COUNT(*) FROM fixed_checks) + (SELECT COUNT(*) FROM savings_moves) AS n`,
    ),
  ]);
  const days = last ? Math.floor((now.getTime() - new Date(last).getTime()) / 86_400_000) : null;
  const hasData = (used?.n ?? 0) > 0;
  return { last_at: last, days, due: hasData && (days === null || days >= BACKUP_REMINDER_DAYS) };
}
