import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import type { MonthKey } from '@/src/utils/dates';

/**
 * Frais de santé : ce qu'on avance (pharmacie, médecin…) et le remboursement
 * attendu (Sécu + mutuelle). « Solder » = remboursement reçu → « Terminé ».
 * Reste à charge = avancé − remboursé.
 */

export type HealthExpense = {
  id: number;
  label: string;
  date: string;
  amount_cents: number;
  refund_cents: number;
  settled: number;
};

export async function listHealthForMonth(db: SQLiteDatabase, month: MonthKey): Promise<HealthExpense[]> {
  return db.getAllAsync<HealthExpense>(
    'SELECT * FROM health_expenses WHERE substr(date, 1, 7) = ? ORDER BY settled, date DESC, id DESC',
    [month],
  );
}

export async function getHealthExpense(db: SQLiteDatabase, id: number): Promise<HealthExpense | null> {
  return db.getFirstAsync<HealthExpense>('SELECT * FROM health_expenses WHERE id = ?', [id]);
}

export async function saveHealthExpense(
  db: SQLiteDatabase,
  input: { id?: number; label: string; date: string; amountCents: number; refundCents: number; settled: boolean },
): Promise<void> {
  const values = [input.label, input.date, input.amountCents, input.refundCents, input.settled ? 1 : 0];
  if (input.id) {
    await db.runAsync(
      'UPDATE health_expenses SET label = ?, date = ?, amount_cents = ?, refund_cents = ?, settled = ? WHERE id = ?',
      [...values, input.id],
    );
  } else {
    await db.runAsync(
      'INSERT INTO health_expenses (label, date, amount_cents, refund_cents, settled) VALUES (?, ?, ?, ?, ?)',
      values,
    );
  }
  invalidateQueries();
}

export async function setHealthSettled(db: SQLiteDatabase, id: number, settled: boolean): Promise<void> {
  await db.runAsync('UPDATE health_expenses SET settled = ? WHERE id = ?', [settled ? 1 : 0, id]);
  invalidateQueries();
}

export async function deleteHealthExpense(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM health_expenses WHERE id = ?', [id]);
  invalidateQueries();
}
