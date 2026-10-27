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
  /** Montant propre au mois demandé (plus ou moins que le mensuel), null = montant mensuel. */
  plan_amount_cents: number | null;
  /** Date prévue du virement du mois (null = pas de date). */
  plan_date: string | null;
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
       EXISTS (SELECT 1 FROM savings_skips k WHERE k.pot_id = p.id AND k.month = ?) AS plan_skipped,
       pm.amount_cents AS plan_amount_cents,
       pm.date AS plan_date
     FROM savings_pots p
     LEFT JOIN savings_plan_months pm ON pm.pot_id = p.id AND pm.month = ?
     ORDER BY CASE p.kind WHEN 'securite' THEN 0 ELSE 1 END, p.sort_order, p.id`,
    [month, month, month],
  );
}

export async function getPot(db: SQLiteDatabase, id: number): Promise<PotWithBalance | null> {
  return db.getFirstAsync<PotWithBalance>(
    `SELECT p.*,
       p.initial_cents + COALESCE((SELECT SUM(m.amount_cents) FROM savings_moves m WHERE m.pot_id = p.id), 0) AS balance_cents,
       0 AS plan_done, 0 AS plan_skipped, NULL AS plan_amount_cents, NULL AS plan_date
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

/**
 * Corrige le solde d'une cagnotte : le montant saisi devient son solde
 * actuel. Seul le montant de départ est ajusté (solde = départ + virements) :
 * l'historique des virements est gardé et le compte courant n'est pas touché.
 */
export async function setPotBalance(db: SQLiteDatabase, potId: number, balanceCents: number): Promise<void> {
  await db.runAsync(
    `UPDATE savings_pots
     SET initial_cents = ? - COALESCE((SELECT SUM(amount_cents) FROM savings_moves WHERE pot_id = ?), 0)
     WHERE id = ?`,
    [balanceCents, potId, potId],
  );
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

/**
 * Pointe / dépointe le virement du mois : pointer crée le dépôt (montant du
 * mois s'il a été changé, sinon le mensuel ; à sa date prévue s'il en a une),
 * dépointer le retire.
 */
export async function setPlanDone(
  db: SQLiteDatabase,
  pot: Pot,
  month: MonthKey,
  done: boolean,
  date: string,
): Promise<void> {
  if (done) {
    const plan = await getMonthPlan(db, pot.id, month);
    const amount = plan?.amount_cents ?? pot.monthly_cents ?? 0;
    if (amount <= 0) return;
    await db.withTransactionAsync(async () => {
      // Verser ce mois-ci annule un éventuel « Pas ce mois-ci ».
      await db.runAsync('DELETE FROM savings_skips WHERE pot_id = ? AND month = ?', [pot.id, month]);
      await db.runAsync(
        "INSERT OR IGNORE INTO savings_moves (pot_id, amount_cents, date, note, plan_month, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        [pot.id, amount, plan?.date ?? date, 'Versement programmé', month],
      );
    });
  } else {
    await db.runAsync('DELETE FROM savings_moves WHERE pot_id = ? AND plan_month = ?', [pot.id, month]);
  }
  invalidateQueries();
}

function getMonthPlan(db: SQLiteDatabase, potId: number, month: MonthKey) {
  return db.getFirstAsync<{ amount_cents: number | null; date: string | null }>(
    'SELECT amount_cents, date FROM savings_plan_months WHERE pot_id = ? AND month = ?',
    [potId, month],
  );
}

/**
 * Planifie le virement d'un mois : montant propre à ce mois (null = le
 * versement mensuel) et date prévue (null = sans date). 0 € = « Pas ce
 * mois-ci ». S'il est déjà pointé, le dépôt suit le nouveau montant et la
 * nouvelle date — le plan, la pastille et le compte restent alignés.
 */
export async function setMonthPlan(
  db: SQLiteDatabase,
  pot: Pot,
  month: MonthKey,
  input: { amountCents: number | null; date: string | null },
): Promise<void> {
  if (input.amountCents === 0) {
    await db.runAsync('DELETE FROM savings_plan_months WHERE pot_id = ? AND month = ?', [pot.id, month]);
    await setPlanSkipped(db, pot.id, month, true);
    return;
  }
  const amount = input.amountCents ?? pot.monthly_cents ?? 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM savings_skips WHERE pot_id = ? AND month = ?', [pot.id, month]);
    if (input.amountCents === null && input.date === null) {
      await db.runAsync('DELETE FROM savings_plan_months WHERE pot_id = ? AND month = ?', [pot.id, month]);
    } else {
      await db.runAsync(
        `INSERT INTO savings_plan_months (pot_id, month, amount_cents, date) VALUES (?, ?, ?, ?)
         ON CONFLICT (pot_id, month) DO UPDATE SET amount_cents = excluded.amount_cents, date = excluded.date`,
        [pot.id, month, input.amountCents, input.date],
      );
    }
    if (amount > 0) {
      await db.runAsync(
        'UPDATE savings_moves SET amount_cents = ?, date = COALESCE(?, date) WHERE pot_id = ? AND plan_month = ?',
        [amount, input.date, pot.id, month],
      );
    } else {
      await db.runAsync('DELETE FROM savings_moves WHERE pot_id = ? AND plan_month = ?', [pot.id, month]);
    }
  });
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

/** Virement prévu pour le mois : montant du mois s'il a été changé, sinon le mensuel (0 si sauté). */
export function plannedFor(pot: PotWithBalance): number {
  return pot.plan_skipped === 1 ? 0 : pot.plan_amount_cents ?? pot.monthly_cents ?? 0;
}

/** La cagnotte a-t-elle un virement à afficher ce mois-ci (mensuel, planifié, sauté ou pointé) ? */
export function hasMonthPlan(pot: PotWithBalance): boolean {
  return (pot.monthly_cents ?? 0) > 0 || pot.plan_amount_cents !== null || pot.plan_done === 1;
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

// ---------- Projection du plan d'épargne ----------

export type ProjectionPot = {
  id: number;
  name: string;
  color: string;
  now_cents: number;
  end_cents: number;
  monthly_cents: number;
  /** Objectif atteint pendant la période (les versements s'arrêtent là). */
  reaches_target: boolean;
};

export type SavingsProjection = {
  /** Total de toutes les cagnottes aujourd'hui. */
  now_cents: number;
  /** Total fin de mois, de `from` à `to` inclus. */
  months: Array<{ month: MonthKey; total_cents: number }>;
  end_cents: number;
  pots: ProjectionPot[];
};

/**
 * Si j'applique mon plan : chaque cagnotte reçoit son versement programmé
 * (ou le montant planifié pour ce mois) chaque mois de `from` à `to` (sauf
 * mois « Pas ce mois-ci » ; le mois `from`
 * seulement s'il n'est pas déjà versé), sans dépasser son objectif.
 */
export async function getSavingsProjection(db: SQLiteDatabase, from: MonthKey, to: MonthKey): Promise<SavingsProjection> {
  const [pots, skips, plans] = await Promise.all([
    listPots(db, from),
    db.getAllAsync<{ pot_id: number; month: MonthKey }>(
      'SELECT pot_id, month FROM savings_skips WHERE month >= ? AND month <= ?',
      [from, to],
    ),
    db.getAllAsync<{ pot_id: number; month: MonthKey; amount_cents: number }>(
      'SELECT pot_id, month, amount_cents FROM savings_plan_months WHERE amount_cents IS NOT NULL AND month >= ? AND month <= ?',
      [from, to],
    ),
  ]);
  const skipped = new Set(skips.map((s) => `${s.pot_id}:${s.month}`));
  const custom = new Map(plans.map((p) => [`${p.pot_id}:${p.month}`, p.amount_cents]));
  const months: MonthKey[] = [];
  for (let m = from; m <= to; m = shiftMonth(m)) months.push(m);

  const balances = new Map(pots.map((p) => [p.id, p.balance_cents]));
  const reached = new Set<number>();
  const totals = months.map((month) => {
    for (const pot of pots) {
      const monthly = custom.get(`${pot.id}:${month}`) ?? pot.monthly_cents ?? 0;
      if (monthly <= 0 || skipped.has(`${pot.id}:${month}`)) continue;
      if (month === from && pot.plan_done === 1) continue;
      const current = balances.get(pot.id) ?? 0;
      const next = pot.target_cents ? Math.min(pot.target_cents, current + monthly) : current + monthly;
      if (pot.target_cents && next >= pot.target_cents && current < pot.target_cents) reached.add(pot.id);
      balances.set(pot.id, Math.max(current, next));
    }
    return { month, total_cents: [...balances.values()].reduce((s, v) => s + v, 0) };
  });

  const now = pots.reduce((s, p) => s + p.balance_cents, 0);
  return {
    now_cents: now,
    months: totals,
    end_cents: totals.length ? totals[totals.length - 1].total_cents : now,
    pots: pots.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      now_cents: p.balance_cents,
      end_cents: balances.get(p.id) ?? p.balance_cents,
      monthly_cents: p.monthly_cents ?? 0,
      reaches_target: reached.has(p.id),
    })),
  };
}

function shiftMonth(month: MonthKey): MonthKey {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// ---------- Objectifs intelligents ----------

export type GoalAdvice = {
  /** Reste à mettre pour atteindre l'objectif (0 si atteint, null sans objectif). */
  missing_cents: number | null;
  /** Versements encore possibles avant la date limite (mois en cours compris s'il n'est pas versé). */
  months_left: number | null;
  /** Versement mensuel nécessaire pour tenir la date limite (arrondi à l'euro supérieur). */
  needed_monthly_cents: number | null;
  /** Le versement programmé suffit-il pour la date limite ? */
  on_track: boolean | null;
  /** Au rythme programmé, mois où l'objectif sera atteint. */
  reach_month: MonthKey | null;
};

/** Ce qu'il faut pour atteindre l'objectif d'une cagnotte, vu depuis `month`. */
export function goalAdvice(pot: PotWithBalance, month: MonthKey): GoalAdvice {
  const target = pot.target_cents ?? 0;
  if (target <= 0) return { missing_cents: null, months_left: null, needed_monthly_cents: null, on_track: null, reach_month: null };
  const missing = Math.max(0, target - pot.balance_cents);
  if (missing === 0) return { missing_cents: 0, months_left: null, needed_monthly_cents: 0, on_track: true, reach_month: null };
  const doneNow = pot.plan_done === 1;
  const first = doneNow ? shiftMonth(month) : month;
  let monthsLeft: number | null = null;
  let needed: number | null = null;
  if (pot.deadline) {
    const end = pot.deadline.slice(0, 7);
    monthsLeft = Math.max(0, monthIndex(end) - monthIndex(first) + 1);
    needed = Math.ceil(missing / Math.max(1, monthsLeft) / 100) * 100;
  }
  const monthly = pot.monthly_cents ?? 0;
  let reach: MonthKey | null = null;
  if (monthly > 0) {
    let m = first;
    for (let i = 1; i < Math.ceil(missing / monthly); i++) m = shiftMonth(m);
    reach = m;
  }
  return {
    missing_cents: missing,
    months_left: monthsLeft,
    needed_monthly_cents: needed,
    on_track: needed === null ? null : monthly >= needed,
    reach_month: reach,
  };
}

function monthIndex(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Change le versement mensuel programmé d'une cagnotte (ex. « Ajuster à 85 € »). */
export async function setPotMonthly(db: SQLiteDatabase, potId: number, monthlyCents: number | null): Promise<void> {
  await db.runAsync('UPDATE savings_pots SET monthly_cents = ? WHERE id = ?', [monthlyCents, potId]);
  invalidateQueries();
}

// ---------- Provisions pour les charges annuelles ----------

/**
 * Crée une cagnotte qui lisse une grosse charge (assurance annuelle,
 * impôts…) : objectif = montant, date limite = échéance, versement mensuel =
 * de quoi l'atteindre avant l'échéance. Le jour J, on retire la cagnotte
 * pour payer.
 */
export async function createProvisionPot(
  db: SQLiteDatabase,
  input: { name: string; amountCents: number; dueDate: string; fromMonth: MonthKey; color: string },
): Promise<void> {
  const months = Math.max(1, monthIndex(input.dueDate.slice(0, 7)) - monthIndex(input.fromMonth));
  await savePot(db, {
    name: `Provision ${input.name}`,
    icon: 'calendar-outline',
    color: input.color,
    kind: 'projet',
    initialCents: 0,
    targetCents: input.amountCents,
    monthlyCents: Math.ceil(input.amountCents / months / 100) * 100,
    deadline: input.dueDate,
  });
}
