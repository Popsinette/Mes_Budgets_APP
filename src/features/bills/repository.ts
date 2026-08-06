import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import { todayInMonth, type MonthKey } from '@/src/utils/dates';

export type Bill = {
  id: number;
  name: string;
  amount_cents: number;
  due_day: number;
  category_id: number | null;
  active: number;
  created_at: string;
};

export type BillWithStatus = Bill & {
  paid_at: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
};

export async function createBill(
  db: SQLiteDatabase,
  input: { name: string; amountCents: number; dueDay: number; categoryId?: number | null },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO bills (name, amount_cents, due_day, category_id, active, created_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))`,
    [input.name, input.amountCents, input.dueDay, input.categoryId ?? null],
  );
  invalidateQueries();
}

/**
 * Modifie une facture. Les dépenses déjà créées par les pointages suivent
 * (libellé, montant, catégorie) : le total « réglées » d'un mois se calcule à
 * partir du montant courant de la facture, donc laisser les anciennes dépenses
 * en arrière ferait diverger les soldes. La date de chaque dépense, elle, ne
 * bouge pas — c'est le jour où le prélèvement a été constaté.
 */
export async function updateBill(
  db: SQLiteDatabase,
  input: { id: number; name: string; amountCents: number; dueDay: number; categoryId?: number | null },
): Promise<void> {
  await db.runAsync('UPDATE bills SET name = ?, amount_cents = ?, due_day = ?, category_id = ? WHERE id = ?', [
    input.name,
    input.amountCents,
    input.dueDay,
    input.categoryId ?? null,
    input.id,
  ]);
  await db.runAsync(
    `UPDATE transactions SET label = ?, amount_cents = ?, category_id = ?
     WHERE id IN (SELECT transaction_id FROM bill_payments WHERE bill_id = ? AND transaction_id IS NOT NULL)`,
    [input.name, input.amountCents, input.categoryId ?? null, input.id],
  );
  invalidateQueries();
}

export async function deleteBill(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM bills WHERE id = ?', [id]);
  invalidateQueries();
}

/** Factures actives avec leur statut de paiement pour le mois donné. */
export async function listBillsForMonth(
  db: SQLiteDatabase,
  month: MonthKey,
): Promise<BillWithStatus[]> {
  return db.getAllAsync<BillWithStatus>(
    `SELECT b.*,
       p.paid_at,
       c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM bills b
     LEFT JOIN bill_payments p ON p.bill_id = b.id AND p.month = ?
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE b.active = 1
     ORDER BY b.due_day, b.name`,
    [month],
  );
}

/**
 * Pointe/dé-pointe une facture pour un mois donné.
 * Pointer crée automatiquement la dépense correspondante dans les opérations,
 * **datée du jour du pointage** (c'est la date à laquelle on constate le
 * prélèvement, pas la date d'échéance présumée) ; dé-pointer la supprime.
 * Pour un mois autre que le mois courant, la date reste bornée à ce mois
 * (`todayInMonth`) pour ne pas désaccorder `date` et `month`.
 */
export async function setBillPaid(
  db: SQLiteDatabase,
  billId: number,
  month: MonthKey,
  paid: boolean,
): Promise<void> {
  if (paid) {
    const bill = await db.getFirstAsync<Bill>('SELECT * FROM bills WHERE id = ?', [billId]);
    if (!bill) return;
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM bill_payments WHERE bill_id = ? AND month = ?',
      [billId, month],
    );
    if (existing) return;

    const result = await db.runAsync(
      `INSERT INTO transactions (category_id, label, amount_cents, type, date, month, note, bill_id)
       VALUES (?, ?, ?, 'expense', ?, ?, 'Facture récurrente', ?)`,
      [bill.category_id, bill.name, bill.amount_cents, todayInMonth(month), month, billId],
    );
    await db.runAsync(
      `INSERT INTO bill_payments (bill_id, month, paid_at, transaction_id) VALUES (?, ?, datetime('now'), ?)`,
      [billId, month, result.lastInsertRowId],
    );
  } else {
    const payment = await db.getFirstAsync<{ id: number; transaction_id: number | null }>(
      'SELECT id, transaction_id FROM bill_payments WHERE bill_id = ? AND month = ?',
      [billId, month],
    );
    if (payment?.transaction_id) {
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [payment.transaction_id]);
    }
    await db.runAsync('DELETE FROM bill_payments WHERE bill_id = ? AND month = ?', [billId, month]);
  }
  invalidateQueries();
}

export type BillsRepairReport = {
  /** Factures pointées dont la dépense avait disparu : remises « à payer ». */
  unpointed: number;
  /** Dépenses de factures dont le montant ne correspondait plus : réalignées. */
  realigned: number;
};

/**
 * Répare les pointages incohérents, ceux qui font diverger le « reste à vivre
 * prévisionnel » du « prévisionnel avec budgets » (le premier doit toujours
 * être le plus haut, l'écart valant les dépassements de budgets).
 *
 * Deux cas hérités des versions précédentes :
 * - une facture pointée dont la dépense a été supprimée depuis l'activité →
 *   on la remet « à payer » (un tap la re-pointe et recrée la dépense) ;
 * - une dépense dont le montant ne suit plus celui de la facture → réalignée.
 */
export async function repairBillPayments(db: SQLiteDatabase): Promise<BillsRepairReport> {
  const orphans = await db.runAsync(
    `DELETE FROM bill_payments
     WHERE transaction_id IS NULL
        OR transaction_id NOT IN (SELECT id FROM transactions)`,
  );
  const mismatched = await db.runAsync(
    `UPDATE transactions SET amount_cents = (
       SELECT b.amount_cents FROM bills b
       JOIN bill_payments p ON p.bill_id = b.id
       WHERE p.transaction_id = transactions.id
     )
     WHERE id IN (
       SELECT p.transaction_id FROM bill_payments p
       JOIN bills b ON b.id = p.bill_id
       JOIN transactions t ON t.id = p.transaction_id
       WHERE t.amount_cents <> b.amount_cents
     )`,
  );
  invalidateQueries();
  return { unpointed: orphans.changes, realigned: mismatched.changes };
}

export type BillsSummary = {
  total_cents: number;
  paid_cents: number;
  unpaid_count: number;
};

export async function getBillsSummary(db: SQLiteDatabase, month: MonthKey): Promise<BillsSummary> {
  const row = await db.getFirstAsync<BillsSummary>(
    `SELECT
       COALESCE(SUM(b.amount_cents), 0) AS total_cents,
       COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN b.amount_cents ELSE 0 END), 0) AS paid_cents,
       COALESCE(SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END), 0) AS unpaid_count
     FROM bills b
     LEFT JOIN bill_payments p ON p.bill_id = b.id AND p.month = ?
     WHERE b.active = 1`,
    [month],
  );
  return row ?? { total_cents: 0, paid_cents: 0, unpaid_count: 0 };
}
