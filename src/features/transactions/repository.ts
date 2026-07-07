import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import type { MonthKey } from '@/src/utils/dates';

export type TransactionType = 'expense' | 'income';

export type Transaction = {
  id: number;
  category_id: number | null;
  label: string;
  amount_cents: number;
  type: TransactionType;
  date: string;
  month: MonthKey;
  note: string | null;
};

export type TransactionWithCategory = Transaction & {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
};

export type MonthTotals = {
  income_cents: number;
  expense_cents: number;
};

export async function addTransaction(
  db: SQLiteDatabase,
  input: {
    categoryId: number | null;
    label: string;
    amountCents: number;
    type: TransactionType;
    date: string;
    month: MonthKey;
    note?: string;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO transactions (category_id, label, amount_cents, type, date, month, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.categoryId, input.label, input.amountCents, input.type, input.date, input.month, input.note ?? null],
  );
  invalidateQueries();
}

export async function deleteTransaction(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  invalidateQueries();
}

export async function listTransactionsForMonth(
  db: SQLiteDatabase,
  month: MonthKey,
): Promise<TransactionWithCategory[]> {
  return db.getAllAsync<TransactionWithCategory>(
    `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.month = ?
     ORDER BY t.date DESC, t.id DESC`,
    [month],
  );
}

export async function getMonthTotals(db: SQLiteDatabase, month: MonthKey): Promise<MonthTotals> {
  const row = await db.getFirstAsync<MonthTotals>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents
     FROM transactions WHERE month = ?`,
    [month],
  );
  return row ?? { income_cents: 0, expense_cents: 0 };
}

export type MonthlyPoint = {
  month: MonthKey;
  income_cents: number;
  expense_cents: number;
};

/** Revenus/dépenses agrégés pour chaque mois demandé (0 pour les mois sans opération). */
export async function getMonthlySeries(
  db: SQLiteDatabase,
  months: MonthKey[],
): Promise<MonthlyPoint[]> {
  if (months.length === 0) return [];
  const placeholders = months.map(() => '?').join(', ');
  const rows = await db.getAllAsync<MonthlyPoint>(
    `SELECT
       month,
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents
     FROM transactions
     WHERE month IN (${placeholders})
     GROUP BY month`,
    months,
  );
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map(
    (month) => byMonth.get(month) ?? { month, income_cents: 0, expense_cents: 0 },
  );
}

export type CategorySpending = {
  category_id: number | null;
  category_name: string;
  category_icon: string;
  category_color: string;
  spent_cents: number;
};

export async function getSpendingByCategory(
  db: SQLiteDatabase,
  month: MonthKey,
): Promise<CategorySpending[]> {
  return db.getAllAsync<CategorySpending>(
    `SELECT
       t.category_id,
       COALESCE(c.name, 'Sans catégorie') AS category_name,
       COALESCE(c.icon, 'help-circle-outline') AS category_icon,
       COALESCE(c.color, '#64748B') AS category_color,
       SUM(t.amount_cents) AS spent_cents
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.month = ? AND t.type = 'expense'
     GROUP BY t.category_id
     ORDER BY spent_cents DESC`,
    [month],
  );
}
