import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import type { MonthKey } from '@/src/utils/dates';

/**
 * Poches d'épargne (méthode Budgetiz) : « Urgence & avenir » (sécurité, on
 * n'y touche pas) et « Projets & pépins » (vacances, réparations, cadeaux…).
 * Solde = valeur de départ + Σ mouvements (dépôts positifs, retraits négatifs).
 */

export type PotKind = 'securite' | 'projet';

export const POT_KIND_LABELS: Record<PotKind, string> = {
  securite: 'Urgence & avenir',
  projet: 'Projets & pépins',
};

export type Pot = {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: PotKind;
  initial_cents: number;
  target_cents: number | null;
  monthly_cents: number | null;
  sort_order: number;
};

export type PotWithBalance = Pot & {
  balance_cents: number;
  /** Versement programmé du mois demandé déjà fait ? */
  plan_done: number;
};

export type SavingsMove = {
  id: number;
  pot_id: number;
  amount_cents: number;
  date: string;
  note: string | null;
  plan_month: MonthKey | null;
  week: string | null;
};

export async function listPots(db: SQLiteDatabase, month: MonthKey): Promise<PotWithBalance[]> {
  return db.getAllAsync<PotWithBalance>(
    `SELECT p.*,
       p.initial_cents + COALESCE((SELECT SUM(m.amount_cents) FROM savings_moves m WHERE m.pot_id = p.id), 0) AS balance_cents,
       EXISTS (SELECT 1 FROM savings_moves m WHERE m.pot_id = p.id AND m.plan_month = ?) AS plan_done
     FROM savings_pots p
     ORDER BY CASE p.kind WHEN 'securite' THEN 0 ELSE 1 END, p.sort_order, p.id`,
    [month],
  );
}

export async function getPot(db: SQLiteDatabase, id: number): Promise<PotWithBalance | null> {
  return db.getFirstAsync<PotWithBalance>(
    `SELECT p.*,
       p.initial_cents + COALESCE((SELECT SUM(m.amount_cents) FROM savings_moves m WHERE m.pot_id = p.id), 0) AS balance_cents,
       0 AS plan_done
     FROM savings_pots p WHERE p.id = ?`,
    [id],
  );
}

export async function savePot(
  db: SQLiteDatabase,
  input: {
    id?: number;
    name: string;
    icon: string;
    color: string;
    kind: PotKind;
    initialCents: number;
    targetCents: number | null;
    monthlyCents: number | null;
  },
): Promise<void> {
  const values = [
    input.name,
    input.icon,
    input.color,
    input.kind,
    input.initialCents,
    input.targetCents,
    input.monthlyCents,
  ];
  if (input.id) {
    await db.runAsync(
      `UPDATE savings_pots SET name = ?, icon = ?, color = ?, kind = ?, initial_cents = ?, target_cents = ?, monthly_cents = ?
       WHERE id = ?`,
      [...values, input.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO savings_pots (name, icon, color, kind, initial_cents, target_cents, monthly_cents, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM savings_pots), datetime('now'))`,
      values,
    );
  }
  invalidateQueries();
}

export async function deletePot(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM savings_pots WHERE id = ?', [id]);
  invalidateQueries();
}

// ---------- Mouvements ----------

export async function listMoves(db: SQLiteDatabase, potId: number): Promise<SavingsMove[]> {
  return db.getAllAsync<SavingsMove>(
    'SELECT * FROM savings_moves WHERE pot_id = ? ORDER BY date DESC, id DESC',
    [potId],
  );
}

export async function addMove(
  db: SQLiteDatabase,
  input: { potId: number; amountCents: number; date: string; note: string | null },
): Promise<void> {
  await db.runAsync('INSERT INTO savings_moves (pot_id, amount_cents, date, note) VALUES (?, ?, ?, ?)', [
    input.potId,
    input.amountCents,
    input.date,
    input.note,
  ]);
  invalidateQueries();
}

/** Supprime un mouvement ; s'il venait d'un reste de semaine, la semaine redevient « à solder ». */
export async function deleteMove(db: SQLiteDatabase, move: SavingsMove): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM savings_moves WHERE id = ?', [move.id]);
    if (move.week) await db.runAsync('DELETE FROM week_closures WHERE week = ?', [move.week]);
  });
  invalidateQueries();
}

/** Coche / décoche le versement programmé du mois (crée ou retire le dépôt correspondant). */
export async function setPlanDone(
  db: SQLiteDatabase,
  pot: Pot,
  month: MonthKey,
  done: boolean,
  date: string,
): Promise<void> {
  if (done) {
    if (!pot.monthly_cents) return;
    await db.runAsync(
      'INSERT OR IGNORE INTO savings_moves (pot_id, amount_cents, date, note, plan_month) VALUES (?, ?, ?, ?, ?)',
      [pot.id, pot.monthly_cents, date, 'Versement programmé', month],
    );
  } else {
    await db.runAsync('DELETE FROM savings_moves WHERE pot_id = ? AND plan_month = ?', [pot.id, month]);
  }
  invalidateQueries();
}

/** Épargne mise de côté pendant le mois (dépôts − retraits datés de ce mois). */
export async function getMonthSaved(db: SQLiteDatabase, month: MonthKey): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM savings_moves WHERE substr(date, 1, 7) = ?",
    [month],
  );
  return row?.total ?? 0;
}
