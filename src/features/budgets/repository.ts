import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import type { TransactionWithCategory } from '@/src/features/transactions/repository';
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
           AND t.bill_id IS NULL  -- les prélèvements de factures ne comptent pas dans les budgets
       ), 0) AS spent_cents
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.month = ?
     ORDER BY c.sort_order, c.name`,
    [month],
  );
}

/** Un budget précis (catégorie + mois) avec son total dépensé, ou null. */
export async function getBudgetForCategory(
  db: SQLiteDatabase,
  categoryId: number,
  month: MonthKey,
): Promise<BudgetWithSpending | null> {
  const row = await db.getFirstAsync<BudgetWithSpending>(
    `SELECT
       b.id, b.category_id, b.month, b.amount_cents,
       c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
       COALESCE((
         SELECT SUM(t.amount_cents) FROM transactions t
         WHERE t.category_id = b.category_id AND t.month = b.month AND t.type = 'expense'
           AND t.bill_id IS NULL
       ), 0) AS spent_cents
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.category_id = ? AND b.month = ?`,
    [categoryId, month],
  );
  return row ?? null;
}

/**
 * Dépenses d'une catégorie pour un mois, telles que comptées dans le budget
 * (dépenses libres uniquement : les prélèvements de factures, `bill_id`, sont
 * exclus comme dans `listBudgetsWithSpending`).
 */
export async function listBudgetExpenses(
  db: SQLiteDatabase,
  categoryId: number,
  month: MonthKey,
): Promise<TransactionWithCategory[]> {
  return db.getAllAsync<TransactionWithCategory>(
    `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.category_id = ? AND t.month = ? AND t.type = 'expense' AND t.bill_id IS NULL
     ORDER BY t.date DESC, t.id DESC`,
    [categoryId, month],
  );
}

export type BudgetAlignment = {
  /** Budgets recalés (relevés ou abaissés) au niveau réellement dépensé. */
  adjusted: number;
  /** Budgets créés pour les catégories dépensées sans budget. */
  created: number;
  /** Budgets non entamés supprimés (aucune dépense ce mois-ci). */
  removed: number;
  /** Dépenses libres sans catégorie : impossibles à couvrir par un budget. */
  uncategorizedCents: number;
};

/**
 * Recale les budgets du mois sur les dépenses réelles, dans les deux sens,
 * pour que le reste à allouer devienne exactement le reste réel : chaque
 * budget prend le montant déjà dépensé (relevé s'il est dépassé, abaissé s'il
 * est entamé), les budgets sans aucune dépense sont supprimés, et un budget
 * est créé pour chaque catégorie dépensée sans budget. Les dépenses sans
 * catégorie ne peuvent pas être couvertes — leur total est renvoyé pour
 * l'annoncer (elles maintiennent un écart résiduel).
 */
export async function alignBudgetsWithSpending(
  db: SQLiteDatabase,
  month: MonthKey,
): Promise<BudgetAlignment> {
  const spentSql = `(
    SELECT COALESCE(SUM(t.amount_cents), 0) FROM transactions t
    WHERE t.category_id = budgets.category_id AND t.month = budgets.month
      AND t.type = 'expense' AND t.bill_id IS NULL)`;
  const removed = await db.runAsync(
    `DELETE FROM budgets WHERE month = ? AND ${spentSql} = 0`,
    [month],
  );
  const adjusted = await db.runAsync(
    `UPDATE budgets SET amount_cents = ${spentSql}
     WHERE month = ? AND amount_cents <> ${spentSql}`,
    [month],
  );
  const created = await db.runAsync(
    `INSERT INTO budgets (category_id, month, amount_cents)
     SELECT t.category_id, t.month, SUM(t.amount_cents)
     FROM transactions t
     WHERE t.month = ? AND t.type = 'expense' AND t.bill_id IS NULL AND t.category_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM budgets b WHERE b.category_id = t.category_id AND b.month = t.month
       )
     GROUP BY t.category_id`,
    [month],
  );
  const uncategorized = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
     WHERE month = ? AND type = 'expense' AND bill_id IS NULL AND category_id IS NULL`,
    [month],
  );
  invalidateQueries();
  return {
    adjusted: adjusted.changes,
    created: created.changes,
    removed: removed.changes,
    uncategorizedCents: uncategorized?.total ?? 0,
  };
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
