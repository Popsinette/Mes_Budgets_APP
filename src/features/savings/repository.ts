import type { SQLiteDatabase } from 'expo-sqlite';
import { undoClosureRow, type ClosureRow } from '@/src/features/envelopes/repository';
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
  deadline: string | null;
  sort_order: number;
};

export type PotWithBalance = Pot & {
  balance_cents: number;
  /** Versement programmé du mois demandé déjà fait ? */
  plan_done: number;
  /** Versement programmé sauté ce mois-ci (« Pas ce mois-ci ») ? */
  plan_skipped: number;
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
       EXISTS (SELECT 1 FROM savings_moves m WHERE m.pot_id = p.id AND m.plan_month = ?) AS plan_done,
       EXISTS (SELECT 1 FROM savings_skips k WHERE k.pot_id = p.id AND k.month = ?) AS plan_skipped
     FROM savings_pots p
     ORDER BY CASE p.kind WHEN 'securite' THEN 0 ELSE 1 END, p.sort_order, p.id`,
    [month, month],
  );
}

export async function getPot(db: SQLiteDatabase, id: number): Promise<PotWithBalance | null> {
  return db.getFirstAsync<PotWithBalance>(
    `SELECT p.*,
       p.initial_cents + COALESCE((SELECT SUM(m.amount_cents) FROM savings_moves m WHERE m.pot_id = p.id), 0) AS balance_cents,
       0 AS plan_done, 0 AS plan_skipped
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
    deadline: string | null;
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
    input.deadline,
  ];
  if (input.id) {
    await db.runAsync(
      `UPDATE savings_pots SET name = ?, icon = ?, color = ?, kind = ?, initial_cents = ?, target_cents = ?, monthly_cents = ?,
         deadline = ?
       WHERE id = ?`,
      [...values, input.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO savings_pots (name, icon, color, kind, initial_cents, target_cents, monthly_cents, deadline, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM savings_pots), datetime('now'))`,
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
  await db.runAsync("INSERT INTO savings_moves (pot_id, amount_cents, date, note, created_at) VALUES (?, ?, ?, ?, datetime('now'))", [
    input.potId,
    input.amountCents,
    input.date,
    input.note,
  ]);
  invalidateQueries();
}

/**
 * Supprime un mouvement ; s'il venait d'un reste de semaine, la semaine
 * redevient « à solder » ; s'il venait d'une clôture de mois, l'enveloppe
 * redevient « à clôturer » (son budget est rétabli).
 */
export async function deleteMove(db: SQLiteDatabase, move: SavingsMove): Promise<void> {
  await db.withTransactionAsync(async () => {
    const closure = await db.getFirstAsync<ClosureRow>('SELECT * FROM month_closures WHERE move_id = ?', [move.id]);
    if (closure) await undoClosureRow(db, closure);
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
    await db.withTransactionAsync(async () => {
      // Verser ce mois-ci annule un éventuel « Pas ce mois-ci ».
      await db.runAsync('DELETE FROM savings_skips WHERE pot_id = ? AND month = ?', [pot.id, month]);
      await db.runAsync(
        "INSERT OR IGNORE INTO savings_moves (pot_id, amount_cents, date, note, plan_month, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        [pot.id, pot.monthly_cents, date, 'Versement programmé', month],
      );
    });
  } else {
    await db.runAsync('DELETE FROM savings_moves WHERE pot_id = ? AND plan_month = ?', [pot.id, month]);
  }
  invalidateQueries();
}

/**
 * « Pas ce mois-ci » : saute (ou reprend) le versement programmé d'un mois.
 * Sauter retire le versement du mois s'il était déjà coché ; le montant
 * mensuel de la cagnotte ne change pas pour les autres mois.
 */
export async function setPlanSkipped(db: SQLiteDatabase, potId: number, month: MonthKey, skipped: boolean): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (skipped) {
      await db.runAsync('DELETE FROM savings_moves WHERE pot_id = ? AND plan_month = ?', [potId, month]);
      await db.runAsync('INSERT OR IGNORE INTO savings_skips (pot_id, month) VALUES (?, ?)', [potId, month]);
    } else {
      await db.runAsync('DELETE FROM savings_skips WHERE pot_id = ? AND month = ?', [potId, month]);
    }
  });
  invalidateQueries();
}

/** Versement programmé attendu pour le mois (0 si la cagnotte saute ce mois). */
export function plannedFor(pot: PotWithBalance): number {
  return pot.plan_skipped === 1 ? 0 : pot.monthly_cents ?? 0;
}

/** Épargne mise de côté pendant le mois (dépôts − retraits datés de ce mois). */
export async function getMonthSaved(db: SQLiteDatabase, month: MonthKey): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM savings_moves WHERE substr(date, 1, 7) = ?",
    [month],
  );
  return row?.total ?? 0;
}

export type MoveWithPot = SavingsMove & { pot_name: string; pot_icon: string; pot_color: string };

/** Tous les mouvements (« Mes virements »), du plus récent au plus ancien. */
export async function listAllMoves(db: SQLiteDatabase): Promise<MoveWithPot[]> {
  return db.getAllAsync<MoveWithPot>(
    `SELECT m.*, p.name AS pot_name, p.icon AS pot_icon, p.color AS pot_color
     FROM savings_moves m JOIN savings_pots p ON p.id = m.pot_id
     ORDER BY m.date DESC, m.id DESC`,
  );
}

/** Mouvements nets par mois ('yyyy-MM' → centimes) et total des valeurs de départ. */
export async function getSavingsHistory(
  db: SQLiteDatabase,
): Promise<{ initial_cents: number; months: Array<{ month: MonthKey; net_cents: number }> }> {
  const [initial, months] = await Promise.all([
    db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(initial_cents), 0) AS total FROM savings_pots'),
    db.getAllAsync<{ month: MonthKey; net_cents: number }>(
      `SELECT substr(date, 1, 7) AS month, SUM(amount_cents) AS net_cents
       FROM savings_moves GROUP BY substr(date, 1, 7) ORDER BY month`,
    ),
  ]);
  return { initial_cents: initial?.total ?? 0, months };
}
