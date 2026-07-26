import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import type { MonthKey } from '@/src/utils/dates';

export type SavingsAccount = {
  id: number;
  name: string;
  icon: string;
  color: string;
  initial_cents: number;
  target_cents: number | null;
  monthly_cents: number | null;
  sort_order: number;
  created_at: string;
};

export type SavingsAccountWithBalance = SavingsAccount & {
  /** Solde réel = valeur de départ + virements effectués (cochés). */
  real_cents: number;
  /** Solde prévisionnel = valeur de départ + tous les virements (prévus + effectués). */
  planned_cents: number;
};

export type SavingsTransfer = {
  id: number;
  account_id: number;
  amount_cents: number;
  month: MonthKey;
  date: string;
  done: number;
  note: string | null;
};

// ---------- Comptes ----------

export async function createAccount(
  db: SQLiteDatabase,
  input: {
    name: string;
    icon: string;
    color: string;
    initialCents: number;
    targetCents?: number | null;
    monthlyCents?: number | null;
  },
): Promise<void> {
  const max = await db.getFirstAsync<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM savings_accounts');
  await db.runAsync(
    `INSERT INTO savings_accounts (name, icon, color, initial_cents, target_cents, monthly_cents, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      input.name,
      input.icon,
      input.color,
      input.initialCents,
      input.targetCents ?? null,
      input.monthlyCents ?? null,
      (max?.m ?? 0) + 1,
    ],
  );
  invalidateQueries();
}

export async function updateAccount(
  db: SQLiteDatabase,
  input: {
    id: number;
    name: string;
    icon: string;
    color: string;
    initialCents: number;
    targetCents?: number | null;
    monthlyCents?: number | null;
  },
): Promise<void> {
  await db.runAsync(
    `UPDATE savings_accounts
     SET name = ?, icon = ?, color = ?, initial_cents = ?, target_cents = ?, monthly_cents = ?
     WHERE id = ?`,
    [
      input.name,
      input.icon,
      input.color,
      input.initialCents,
      input.targetCents ?? null,
      input.monthlyCents ?? null,
      input.id,
    ],
  );
  invalidateQueries();
}

export async function deleteAccount(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM savings_accounts WHERE id = ?', [id]);
  invalidateQueries();
}

export async function listAccountsWithBalance(db: SQLiteDatabase): Promise<SavingsAccountWithBalance[]> {
  return db.getAllAsync<SavingsAccountWithBalance>(
    `SELECT a.*,
       a.initial_cents + COALESCE((
         SELECT SUM(t.amount_cents) FROM savings_transfers t WHERE t.account_id = a.id AND t.done = 1
       ), 0) AS real_cents,
       a.initial_cents + COALESCE((
         SELECT SUM(t.amount_cents) FROM savings_transfers t WHERE t.account_id = a.id
       ), 0) AS planned_cents
     FROM savings_accounts a
     ORDER BY a.sort_order, a.name`,
  );
}

// ---------- Virements ----------

export async function addTransfer(
  db: SQLiteDatabase,
  input: { accountId: number; amountCents: number; month: MonthKey; date: string; done: boolean; note?: string },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO savings_transfers (account_id, amount_cents, month, date, done, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.accountId, input.amountCents, input.month, input.date, input.done ? 1 : 0, input.note ?? null],
  );
  invalidateQueries();
}

export async function setTransferDone(db: SQLiteDatabase, id: number, done: boolean): Promise<void> {
  await db.runAsync('UPDATE savings_transfers SET done = ? WHERE id = ?', [done ? 1 : 0, id]);
  invalidateQueries();
}

export async function deleteTransfer(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM savings_transfers WHERE id = ?', [id]);
  invalidateQueries();
}

export async function listTransfersForMonth(db: SQLiteDatabase, month: MonthKey): Promise<SavingsTransfer[]> {
  return db.getAllAsync<SavingsTransfer>(
    'SELECT * FROM savings_transfers WHERE month = ? ORDER BY date, id',
    [month],
  );
}

// ---------- Agrégats ----------

export type SavingsOverview = {
  /** Épargne totale réelle (valeurs de départ + tous les virements effectués). */
  total_real_cents: number;
  /** Somme des valeurs de départ + tous les virements (prévu inclus). */
  total_planned_cents: number;
};

export async function getSavingsOverview(db: SQLiteDatabase): Promise<SavingsOverview> {
  const row = await db.getFirstAsync<SavingsOverview>(
    `SELECT
       COALESCE((SELECT SUM(initial_cents) FROM savings_accounts), 0)
         + COALESCE((SELECT SUM(amount_cents) FROM savings_transfers WHERE done = 1), 0) AS total_real_cents,
       COALESCE((SELECT SUM(initial_cents) FROM savings_accounts), 0)
         + COALESCE((SELECT SUM(amount_cents) FROM savings_transfers), 0) AS total_planned_cents`,
  );
  return row ?? { total_real_cents: 0, total_planned_cents: 0 };
}

/** Objectif d'épargne mensuel type : Σ des virements mensuels prévus des comptes. */
export async function getMonthlySavingsTarget(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ s: number }>(
    'SELECT COALESCE(SUM(monthly_cents), 0) AS s FROM savings_accounts',
  );
  return row?.s ?? 0;
}

/** Épargne prévue pour le mois (tous les virements du mois, cochés ou non) — pour le reste à vivre prévisionnel. */
export async function getPlannedSavingsForMonth(db: SQLiteDatabase, month: MonthKey): Promise<number> {
  const row = await db.getFirstAsync<{ s: number }>(
    'SELECT COALESCE(SUM(amount_cents), 0) AS s FROM savings_transfers WHERE month = ?',
    [month],
  );
  return row?.s ?? 0;
}

/** Épargne réellement virée sur le mois (virements cochés « effectué ») — pour le reste à vivre réel. */
export async function getRealSavingsForMonth(db: SQLiteDatabase, month: MonthKey): Promise<number> {
  const row = await db.getFirstAsync<{ s: number }>(
    'SELECT COALESCE(SUM(amount_cents), 0) AS s FROM savings_transfers WHERE month = ? AND done = 1',
    [month],
  );
  return row?.s ?? 0;
}
