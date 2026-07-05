import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import type { MonthKey } from '@/src/utils/dates';

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

export async function setBillPaid(
  db: SQLiteDatabase,
  billId: number,
  month: MonthKey,
  paid: boolean,
): Promise<void> {
  if (paid) {
    await db.runAsync(
      `INSERT OR IGNORE INTO bill_payments (bill_id, month, paid_at) VALUES (?, ?, datetime('now'))`,
      [billId, month],
    );
  } else {
    await db.runAsync('DELETE FROM bill_payments WHERE bill_id = ? AND month = ?', [billId, month]);
  }
  invalidateQueries();
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
