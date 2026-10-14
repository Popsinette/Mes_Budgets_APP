import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import { monthsBetween, shiftMonthKey, type MonthKey } from '@/src/utils/dates';

/**
 * Revenus et charges fixes planifiés (salaire, loyer, abonnements, assurance
 * annuelle…). Chaque mois, on coche ce qui est reçu / prélevé. Une coche
 * n'est qu'un repère : elle ne crée aucune autre écriture.
 */

export type FixedKind = 'income' | 'charge';
export type Frequency = 'monthly' | 'quarterly' | 'yearly' | 'once';

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: 'Tous les mois',
  quarterly: 'Tous les 3 mois',
  yearly: 'Tous les ans',
  once: 'Une seule fois',
};

export type FixedItem = {
  id: number;
  kind: FixedKind;
  name: string;
  amount_cents: number;
  day: number;
  frequency: Frequency;
  start_month: MonthKey;
  end_month: MonthKey | null;
};

export type FixedItemForMonth = FixedItem & { checked: boolean };

const STEP: Record<Frequency, number> = { monthly: 1, quarterly: 3, yearly: 12, once: 0 };

/** L'élément tombe-t-il ce mois-ci ? */
export function isDueIn(item: FixedItem, month: MonthKey): boolean {
  const offset = monthsBetween(item.start_month, month);
  if (offset < 0) return false;
  if (item.end_month && month > item.end_month) return false;
  const step = STEP[item.frequency];
  return step === 0 ? offset === 0 : offset % step === 0;
}

export async function listFixedForMonth(db: SQLiteDatabase, month: MonthKey): Promise<FixedItemForMonth[]> {
  const rows = await db.getAllAsync<FixedItem & { checked: number }>(
    `SELECT f.*, EXISTS (SELECT 1 FROM fixed_checks c WHERE c.item_id = f.id AND c.month = ?) AS checked
     FROM fixed_items f
     WHERE f.start_month <= ? AND (f.end_month IS NULL OR f.end_month >= ?)
     ORDER BY f.day, f.name`,
    [month, month, month],
  );
  return rows.filter((r) => isDueIn(r, month)).map((r) => ({ ...r, checked: r.checked === 1 }));
}

export async function getFixedItem(db: SQLiteDatabase, id: number): Promise<FixedItem | null> {
  return db.getFirstAsync<FixedItem>('SELECT * FROM fixed_items WHERE id = ?', [id]);
}

export async function saveFixedItem(
  db: SQLiteDatabase,
  input: {
    id?: number;
    kind: FixedKind;
    name: string;
    amountCents: number;
    day: number;
    frequency: Frequency;
    startMonth: MonthKey;
  },
): Promise<void> {
  // Un élément ponctuel ne vaut que pour son mois.
  const endMonth = input.frequency === 'once' ? input.startMonth : null;
  if (input.id) {
    await db.runAsync(
      `UPDATE fixed_items SET kind = ?, name = ?, amount_cents = ?, day = ?, frequency = ?, start_month = ?,
         end_month = CASE WHEN ? IS NOT NULL THEN ? WHEN frequency = 'once' THEN NULL ELSE end_month END
       WHERE id = ?`,
      [input.kind, input.name, input.amountCents, input.day, input.frequency, input.startMonth, endMonth, endMonth, input.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO fixed_items (kind, name, amount_cents, day, frequency, start_month, end_month, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [input.kind, input.name, input.amountCents, input.day, input.frequency, input.startMonth, endMonth],
    );
  }
  invalidateQueries();
}

export async function setFixedChecked(
  db: SQLiteDatabase,
  itemId: number,
  month: MonthKey,
  checked: boolean,
): Promise<void> {
  if (checked) {
    await db.runAsync(
      "INSERT OR IGNORE INTO fixed_checks (item_id, month, checked_at) VALUES (?, ?, datetime('now'))",
      [itemId, month],
    );
  } else {
    await db.runAsync('DELETE FROM fixed_checks WHERE item_id = ? AND month = ?', [itemId, month]);
  }
  invalidateQueries();
}

/**
 * Arrête un élément à partir de `month` : les mois précédents gardent leur
 * historique. S'il commence ce mois-ci (ou après), il est supprimé.
 */
export async function stopFixedItem(db: SQLiteDatabase, item: FixedItem, month: MonthKey): Promise<void> {
  if (item.start_month >= month) {
    await db.runAsync('DELETE FROM fixed_items WHERE id = ?', [item.id]);
  } else {
    await db.runAsync('UPDATE fixed_items SET end_month = ? WHERE id = ?', [shiftMonthKey(month, -1), item.id]);
    await db.runAsync('DELETE FROM fixed_checks WHERE item_id = ? AND month >= ?', [item.id, month]);
  }
  invalidateQueries();
}
