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
  /** Renseigné quand la dépense provient du pointage d'une facture récurrente. */
  bill_id: number | null;
  /** 0 = à venir (en attente sur le compte), 1 = passée (pointée). */
  cleared: number;
};

export type TransactionWithCategory = Transaction & {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
};

export type MonthTotals = {
  /** Prévisionnel : toutes les opérations du mois (pointées ou non). */
  income_cents: number;
  expense_cents: number;
  /** Réel : uniquement les opérations pointées (passées sur le compte). */
  cleared_income_cents: number;
  cleared_expense_cents: number;
  /** Nombre d'opérations encore en attente de pointage. */
  pending_count: number;
  /**
   * Dépenses libres sans catégorie (hors factures) : de l'argent déjà parti
   * qu'aucun budget ne pourra jamais couvrir — les calculs de plan (reste à
   * vivre / reste à allouer) doivent les déduire directement.
   */
  uncategorized_expense_cents: number;
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
    /** false = à venir (en attente sur le compte). Défaut true (déjà passée). */
    cleared?: boolean;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO transactions (category_id, label, amount_cents, type, date, month, note, cleared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.categoryId,
      input.label,
      input.amountCents,
      input.type,
      input.date,
      input.month,
      input.note ?? null,
      input.cleared === false ? 0 : 1,
    ],
  );
  invalidateQueries();
}

/** Pointe (ou dé-pointe) une opération : passée sur le compte ou de nouveau à venir. */
export async function setTransactionCleared(
  db: SQLiteDatabase,
  id: number,
  cleared: boolean,
): Promise<void> {
  await db.runAsync('UPDATE transactions SET cleared = ? WHERE id = ?', [cleared ? 1 : 0, id]);
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
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
       COALESCE(SUM(CASE WHEN type = 'income' AND cleared = 1 THEN amount_cents ELSE 0 END), 0) AS cleared_income_cents,
       COALESCE(SUM(CASE WHEN type = 'expense' AND cleared = 1 THEN amount_cents ELSE 0 END), 0) AS cleared_expense_cents,
       COALESCE(SUM(CASE WHEN cleared = 0 THEN 1 ELSE 0 END), 0) AS pending_count,
       COALESCE(SUM(CASE WHEN type = 'expense' AND bill_id IS NULL AND category_id IS NULL THEN amount_cents ELSE 0 END), 0) AS uncategorized_expense_cents
     FROM transactions WHERE month = ?`,
    [month],
  );
  return (
    row ?? {
      income_cents: 0,
      expense_cents: 0,
      cleared_income_cents: 0,
      cleared_expense_cents: 0,
      pending_count: 0,
      uncategorized_expense_cents: 0,
    }
  );
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
