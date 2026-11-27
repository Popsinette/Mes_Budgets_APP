import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccount, setAccountBalance } from '@/src/features/account/repository';
import { getAccountTimeline } from '@/src/features/guide/repository';
import {
  closeEnvelope,
  getMonthClosure,
  setMonthClosureDone,
  type MonthClosure,
} from '@/src/features/closure/repository';
import {
  ensureMonth,
  isMonthReady,
  listEnvelopesForMonth,
  type EnvelopeForMonth,
} from '@/src/features/envelopes/repository';
import { listFixedForMonth } from '@/src/features/fixed/repository';
import { hasMonthPlan, listPots, plannedFor, setPlanDone } from '@/src/features/savings/repository';
import { getMonthSummary, type MonthSummary } from '@/src/features/summary/repository';
import { invalidateQueries } from '@/src/store/invalidation';
import { getMeta, setMeta } from '@/src/features/backup/repository';
import {
  budgetMonthOfDay,
  currentWeekKey,
  monthDayProgress,
  setEarlyStarts,
  isoDayInMonth,
  monthKeyFromDate,
  shiftMonthKey,
  toIsoDay,
  type MonthKey,
} from '@/src/utils/dates';

/**
 * Passage d'un mois au suivant, en trois temps :
 *
 * 1. **Terminer** le mois : ce qui n'est pas encore coché / pointé (revenus,
 *    factures, dépenses, virements d'épargne) — « Tout cocher » en un geste ;
 * 2. **Ranger les restes** : une seule décision pour toutes les enveloppes
 *    (mettre de côté, reporter, ou laisser sur le compte) ;
 * 3. **Préparer** le mois suivant : son plan, avec les montants de la base ou
 *    ceux du mois qui se termine.
 *
 * Rien de neuf n'est stocké : tout passe par les mécaniques existantes
 * (coches, pointage, `closeEnvelope`, `ensureMonth`) — plan, pastille et
 * compte restent donc alignés.
 */

export type LooseEndKey = 'incomes' | 'charges' | 'expenses' | 'savings';

export type LooseEnd = {
  key: LooseEndKey;
  count: number;
  cents: number;
  /** Quelques libellés pour dire de quoi il s'agit. */
  names: string[];
};

export type MonthHandover = {
  month: MonthKey;
  next: MonthKey;
  summary: MonthSummary;
  /** Ce qui reste à cocher / pointer dans le mois. */
  loose: LooseEnd[];
  closure: MonthClosure;
  /** Σ des restes pas encore rangés. */
  rest_cents: number;
  /** Σ des dépassements pas encore rangés (positif). */
  over_cents: number;
  /** Plan du mois suivant (mêmes chiffres que la Synthèse). */
  next_summary: MonthSummary;
  next_envelopes: EnvelopeForMonth[];
  next_ready: boolean;
  /** Le mois qui se termine a des montants différents de ceux prévus pour le suivant. */
  amounts_differ: boolean;
};

const keyOf = (e: { name: string; period: string }) => `${e.period}|${e.name}`;

export async function getMonthHandover(db: SQLiteDatabase, month: MonthKey): Promise<MonthHandover> {
  const next = shiftMonthKey(month, 1);
  const week = currentWeekKey();
  const [summary, fixed, uncleared, pots, closure, nextSummary, nextEnvelopes, nextReady, envelopes] = await Promise.all([
    getMonthSummary(db, month),
    listFixedForMonth(db, month),
    db.getAllAsync<{ label: string; amount_cents: number }>(
      `SELECT x.label, x.amount_cents FROM expenses x JOIN envelopes e ON e.id = x.envelope_id
       WHERE e.month = ? AND x.cleared_at IS NULL ORDER BY x.date DESC, x.id DESC`,
      [month],
    ),
    listPots(db, month),
    getMonthClosure(db, month),
    getMonthSummary(db, next),
    listEnvelopesForMonth(db, next, week),
    isMonthReady(db, next),
    listEnvelopesForMonth(db, month, week),
  ]);

  const end = (key: LooseEndKey, items: Array<{ name: string; cents: number }>): LooseEnd => ({
    key,
    count: items.length,
    cents: items.reduce((s, i) => s + i.cents, 0),
    names: items.slice(0, 3).map((i) => i.name),
  });
  const pending = (kind: 'income' | 'charge') =>
    fixed.filter((f) => f.kind === kind && !f.checked).map((f) => ({ name: f.name, cents: f.amount_cents }));
  const loose = [
    end('incomes', pending('income')),
    end('charges', pending('charge')),
    end('expenses', uncleared.map((x) => ({ name: x.label, cents: x.amount_cents }))),
    end(
      'savings',
      pots
        .filter((p) => hasMonthPlan(p) && p.plan_done !== 1 && plannedFor(p) > 0)
        .map((p) => ({ name: p.name, cents: plannedFor(p) })),
    ),
  ].filter((l) => l.count > 0);

  const open = closure.lines.filter((l) => !l.closure);
  const nextAmounts = new Map(nextEnvelopes.map((e) => [keyOf(e), e.weekly_cents]));
  const amountsDiffer =
    !envelopes.some((e) => e.virtual) &&
    (envelopes.some((e) => nextAmounts.get(keyOf(e)) !== e.weekly_cents) || envelopes.length !== nextEnvelopes.length);

  return {
    month,
    next,
    summary,
    loose,
    closure,
    rest_cents: open.reduce((s, l) => s + Math.max(0, l.remainder_cents), 0),
    over_cents: open.reduce((s, l) => s + Math.max(0, -l.remainder_cents), 0),
    next_summary: nextSummary,
    next_envelopes: nextEnvelopes,
    next_ready: nextReady,
    amounts_differ: amountsDiffer,
  };
}

/**
 * « Tout est passé » : coche / pointe d'un coup ce qui restait en attente dans
 * le mois pour une famille. `date` = date des virements d'épargne créés.
 */
export async function settleLooseEnd(db: SQLiteDatabase, month: MonthKey, key: LooseEndKey, date: string): Promise<void> {
  if (key === 'incomes' || key === 'charges') {
    const kind = key === 'incomes' ? 'income' : 'charge';
    const items = (await listFixedForMonth(db, month)).filter((f) => f.kind === kind && !f.checked);
    await db.withTransactionAsync(async () => {
      for (const item of items) {
        await db.runAsync(
          "INSERT OR IGNORE INTO fixed_checks (item_id, month, checked_at) VALUES (?, ?, datetime('now'))",
          [item.id, month],
        );
      }
    });
  } else if (key === 'expenses') {
    await db.runAsync(
      `UPDATE expenses SET cleared_at = datetime('now')
       WHERE cleared_at IS NULL AND envelope_id IN (SELECT id FROM envelopes WHERE month = ?)`,
      [month],
    );
  } else {
    const pots = (await listPots(db, month)).filter((p) => hasMonthPlan(p) && p.plan_done !== 1 && plannedFor(p) > 0);
    for (const pot of pots) await setPlanDone(db, pot, month, true, date);
  }
  invalidateQueries();
}

/**
 * Range tous les restes et dépassements encore ouverts d'un mois, en une fois :
 * - `save`  : les restes vont dans la cagnotte, qui couvre aussi les
 *   dépassements (elle reçoit donc le net) ;
 * - `carry` : tout est reporté sur les enveloppes du mois suivant.
 * Renvoie le nombre d'enveloppes rangées.
 */
export async function closeAllEnvelopes(
  db: SQLiteDatabase,
  input: { month: MonthKey; action: 'save' | 'carry'; potId?: number; date: string },
): Promise<number> {
  if (input.action === 'save' && !input.potId) throw new Error('Choisis une cagnotte.');
  const closure = await getMonthClosure(db, input.month);
  const open = closure.lines.filter((l) => !l.closure && l.remainder_cents !== 0);
  for (const line of open) {
    const action = input.action === 'carry' ? 'carry' : line.remainder_cents > 0 ? 'save' : 'cover';
    await closeEnvelope(db, { envelopeId: line.id, action, potId: input.potId, date: input.date });
  }
  return open.length;
}

/**
 * Démarre `month` avec les montants de `from` (« comme le mois dernier ») :
 * chaque enveloppe de `from` retrouve son montant dans `month` (créée si elle
 * n'y est pas). Les reports déjà reçus et les dépenses déjà notées sont gardés.
 */
export async function startMonthLike(db: SQLiteDatabase, month: MonthKey, from: MonthKey): Promise<void> {
  if (!(await isMonthReady(db, from))) return;
  await ensureMonth(db, month);
  await db.withTransactionAsync(async () => {
    const source = await db.getAllAsync<{
      name: string;
      icon: string;
      color: string;
      weekly_cents: number;
      period: string;
      sort_order: number;
      template_id: number | null;
    }>('SELECT name, icon, color, weekly_cents, period, sort_order, template_id FROM envelopes WHERE month = ? ORDER BY sort_order, id', [from]);
    for (const e of source) {
      const target = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM envelopes WHERE month = ? AND name = ? AND period = ? ORDER BY id LIMIT 1',
        [month, e.name, e.period],
      );
      if (target) {
        await db.runAsync('UPDATE envelopes SET weekly_cents = ?, icon = ?, color = ? WHERE id = ?', [
          e.weekly_cents,
          e.icon,
          e.color,
          target.id,
        ]);
      } else {
        await db.runAsync(
          `INSERT INTO envelopes (name, icon, color, weekly_cents, period, sort_order, created_at, month, template_id)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
          [e.name, e.icon, e.color, e.weekly_cents, e.period, e.sort_order, month, e.template_id],
        );
      }
    }
  });
  invalidateQueries();
}

/** Termine le passage : le mois est marqué clôturé et le suivant est ouvert. */
export async function finishHandover(db: SQLiteDatabase, month: MonthKey): Promise<MonthKey> {
  const next = shiftMonthKey(month, 1);
  await ensureMonth(db, next);
  await setMonthClosureDone(db, month, true);
  return next;
}

const startKey = (month: MonthKey) => `month_start:${month}`;

/** Charge les débuts de mois anticipés (`month_start:<mois>`) : à appeler au démarrage et après chaque changement. */
export async function loadBudgetCalendar(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM app_meta WHERE key LIKE 'month_start:%' AND value IS NOT NULL",
  );
  setEarlyStarts(Object.fromEntries(rows.map((r) => [r.key.slice('month_start:'.length), r.value])));
}

/**
 * Passe au mois suivant, même avant la fin du mois civil (le jour de la paie) :
 * - le mois est clôturé et le suivant ouvert (`finishHandover`) ;
 * - si `today` est avant le 1er, le mois suivant commence dès aujourd'hui :
 *   il devient le mois en cours et reçoit les dépenses datées d'aujourd'hui ;
 * - `resetAccount` : le compte repart de 0 € maintenant — les revenus et
 *   dépenses cochés / pointés ensuite s'ajoutent à partir de là ; les
 *   dépenses de ce mois (et d'avant) encore à pointer sont soldées.
 */
export async function switchToNextMonth(
  db: SQLiteDatabase,
  month: MonthKey,
  input: { today: string; resetAccount: boolean },
): Promise<MonthKey> {
  const next = shiftMonthKey(month, 1);
  if (input.today < `${next}-01`) await setMeta(db, startKey(next), input.today);
  await finishHandover(db, month);
  await loadBudgetCalendar(db);
  if (input.resetAccount) {
    // Pas de miettes : les dépenses des mois clôturés encore « à pointer » sont
    // considérées comme passées avant la remise à 0 €.
    const leftovers = await db.getAllAsync<{ id: number }>(
      `SELECT x.id FROM expenses x JOIN envelopes e ON e.id = x.envelope_id
       WHERE x.cleared_at IS NULL AND e.month <= ?`,
      [month],
    );
    await setAccountBalance(db, 0, [], leftovers.map((r) => r.id));
  }
  invalidateQueries();
  return next;
}

/** Annule un début anticipé : le mois précédent redevient le mois en cours (les dépenses déjà notées restent où elles sont). */
export async function cancelEarlyStart(db: SQLiteDatabase, month: MonthKey): Promise<void> {
  await setMeta(db, startKey(month), null);
  await setMonthClosureDone(db, shiftMonthKey(month, -1), false);
  await loadBudgetCalendar(db);
  invalidateQueries();
}

export type HandoverPrompt =
  | { kind: 'finished'; month: MonthKey; next: MonthKey; pending: number }
  | { kind: 'ending'; month: MonthKey; next: MonthKey; days_left: number };

/** Nombre de jours avant la fin du mois à partir duquel on propose de passer au suivant (paie de fin de mois). */
export const PREPARE_DAYS = 6;

/**
 * Faut-il proposer le passage de mois ?
 * - `finished` : le mois précédent est fini et pas encore clôturé ;
 * - `ending`   : le mois en cours se termine dans quelques jours et n'est pas
 *   encore clôturé → « passe au suivant dès aujourd'hui, ou prépare-le ».
 */
export async function getHandoverPrompt(db: SQLiteDatabase, now: Date = new Date()): Promise<HandoverPrompt | null> {
  const current = budgetMonthOfDay(toIsoDay(now), monthKeyFromDate(now));
  const previous = shiftMonthKey(current, -1);
  const closure = await getMonthClosure(db, previous);
  if (closure.ready && !closure.done) {
    return { kind: 'finished', month: previous, next: current, pending: closure.pending };
  }
  const progress = monthDayProgress(current, now);
  const daysLeft = progress.days - progress.day;
  const next = shiftMonthKey(current, 1);
  // Le mois se termine et n'est pas encore clôturé (même si le suivant a déjà été ouvert pour le préparer).
  if (daysLeft < PREPARE_DAYS && (await isMonthReady(db, current)) && (await getMeta(db, `closure_done:${current}`)) !== '1') {
    return { kind: 'ending', month: current, next, days_left: daysLeft };
  }
  return null;
}

/* ─────────────── « À faire » : ce qui demande un geste aujourd'hui ─────────────── */

export type TodoKey = 'handover' | 'late-charges' | 'late-incomes' | 'low-balance' | 'uncleared';

export type Todo = {
  key: TodoKey;
  count: number;
  cents: number;
  names: string[];
  prompt?: HandoverPrompt;
};

/**
 * Les gestes en attente, du plus important au moins important : passage de
 * mois, factures dont la date est passée, revenus attendus, découvert prévu
 * avant la fin du mois, dépenses à pointer (ces deux-là si le compte est suivi).
 */
export async function getTodos(db: SQLiteDatabase, now: Date = new Date()): Promise<Todo[]> {
  const today = toIsoDay(now);
  const month = budgetMonthOfDay(today, monthKeyFromDate(now));
  const [prompt, fixed, uncleared, account] = await Promise.all([
    getHandoverPrompt(db, now),
    listFixedForMonth(db, month),
    db.getFirstAsync<{ n: number; total: number }>(
      'SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS total FROM expenses WHERE cleared_at IS NULL',
    ),
    getAccount(db),
  ]);
  const todos: Todo[] = [];
  if (prompt) {
    todos.push({ key: 'handover', count: prompt.kind === 'finished' ? prompt.pending : 0, cents: 0, names: [], prompt });
  }
  const late = (kind: 'income' | 'charge') =>
    fixed.filter((f) => f.kind === kind && !f.checked && isoDayInMonth(month, f.day) < today);
  const push = (key: TodoKey, items: Array<{ name: string; amount_cents: number }>) => {
    if (items.length === 0) return;
    todos.push({
      key,
      count: items.length,
      cents: items.reduce((s, i) => s + i.amount_cents, 0),
      names: items.slice(0, 3).map((i) => i.name),
    });
  };
  push('late-charges', late('charge'));
  push('late-incomes', late('income'));
  // Découvert prévu avant la fin du mois (compte suivi) : le point le plus bas.
  if (account) {
    const timeline = await getAccountTimeline(db, now);
    if (timeline && timeline.low.balance_cents < 0) {
      todos.push({ key: 'low-balance', count: 1, cents: timeline.low.balance_cents, names: [timeline.low.date] });
    }
  }
  // Le pointage ne sert qu'au compte : inutile de le réclamer s'il n'est pas suivi.
  if (account && (uncleared?.n ?? 0) > 0) {
    todos.push({ key: 'uncleared', count: uncleared!.n, cents: uncleared!.total, names: [] });
  }
  return todos;
}

/** Coche les revenus ou les factures du mois dont la date est passée. */
export async function settleLate(db: SQLiteDatabase, kind: 'income' | 'charge', now: Date = new Date()): Promise<void> {
  const today = toIsoDay(now);
  const month = budgetMonthOfDay(today, monthKeyFromDate(now));
  const items = (await listFixedForMonth(db, month)).filter(
    (f) => f.kind === kind && !f.checked && isoDayInMonth(month, f.day) < today,
  );
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        "INSERT OR IGNORE INTO fixed_checks (item_id, month, checked_at) VALUES (?, ?, datetime('now'))",
        [item.id, month],
      );
    }
  });
  invalidateQueries();
}
