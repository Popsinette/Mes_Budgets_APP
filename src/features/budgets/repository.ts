import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import type { MonthKey } from '@/src/utils/dates';

export type BudgetWithSpending = {
  id: number;
  category_id: number;
  month: MonthKey;
  amount_cents: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  spent_cents: number;
};

export async function upsertBudget(
  db: SQLiteDatabase,
  input: { categoryId: number; month: MonthKey; amountCents: number },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO budgets (category_id, month, amount_cents) VALUES (?, ?, ?)
     ON CONFLICT (category_id, month) DO UPDATE SET amount_cents = excluded.amount_cents`,
    [input.categoryId, input.month, input.amountCents],
  );
  invalidateQueries();
}

export async function deleteBudget(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
  invalidateQueries();
}

export async function listBudgetsWithSpending(
  db: SQLiteDatabase,
  month: MonthKey,
): Promise<BudgetWithSpending[]> {
  return db.getAllAsync<BudgetWithSpending>(
    `SELECT
       b.id, b.category_id, b.month, b.amount_cents,
       c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
       COALESCE((
         SELECT SUM(t.amount_cents) FROM transactions t
         WHERE t.category_id = b.category_id AND t.month = b.month AND t.type = 'expense'
       ), 0) AS spent_cents
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.month = ?
     ORDER BY c.sort_order, c.name`,
    [month],
  );
}

/** Recopie les budgets du mois précédent s'ils n'existent pas encore pour ce mois. */
export async function copyBudgetsFromMonth(
  db: SQLiteDatabase,
  fromMonth: MonthKey,
  toMonth: MonthKey,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO budgets (category_id, month, amount_cents)
     SELECT category_id, ?, amount_cents FROM budgets WHERE month = ?`,
    [toMonth, fromMonth],
  );
  invalidateQueries();
  return result.changes;
}
