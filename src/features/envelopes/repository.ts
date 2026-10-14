import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import { monthOfWeek, shiftMonthKey, weekKeyOf, weeksOfMonth, type MonthKey, type WeekKey } from '@/src/utils/dates';

/**
 * Enveloppes (méthode Budgetiz) :
 * - période « week » : budget variable (Courses, Autres…), montant par semaine,
 *   du lundi au dimanche ; une semaine appartient au mois de son jeudi (celui qui en a le plus de jours). Le
 *   reste d'une semaine terminée peut être mis de côté (voir `closeWeek`).
 * - période « month » : poste suivi avec les Fixes (Essence, Garderie…),
 *   montant par mois civil.
 * `weekly_cents` porte le montant de la période, quelle qu'elle soit (montant
 * par défaut). Chaque enveloppe est propre aux mois : `start_month` /
 * `end_month` bornent sa validité (ponctuelle = un seul mois) et
 * `envelope_months` porte un montant propre à un mois donné.
 */

export type EnvelopePeriod = 'week' | 'month';

export type Envelope = {
  id: number;
  name: string;
  icon: string;
  color: string;
  weekly_cents: number;
  period: EnvelopePeriod;
  sort_order: number;
  start_month: MonthKey | null;
  end_month: MonthKey | null;
};

/** L'enveloppe existe-t-elle ce mois-ci ? */
export function isEnvelopeActive(e: Pick<Envelope, 'start_month' | 'end_month'>, month: MonthKey): boolean {
  return (!e.start_month || e.start_month <= month) && (!e.end_month || e.end_month >= month);
}

/** Ponctuelle = valable un seul mois. */
export function isOneOff(e: Pick<Envelope, 'start_month' | 'end_month'>): boolean {
  return Boolean(e.start_month && e.start_month === e.end_month);
}

export type EnvelopeWithSpending = Envelope & { spent_cents: number };

export type EnvelopeForMonth = Envelope & {
  /** Montant par défaut (tous les mois) ; `weekly_cents` = montant de CE mois. */
  default_cents: number;
  /** Montant propre à ce mois (sinon montant par défaut). */
  has_override: boolean;
  /** Budget du mois : montant × nb de semaines (week) ou montant (month). */
  budget_cents: number;
  spent_cents: number;
  /** Semaine en cours (si elle appartient au mois) : dépensé. */
  week_spent_cents: number;
};

export type Expense = {
  id: number;
  envelope_id: number;
  label: string;
  amount_cents: number;
  date: string;
  week: WeekKey;
  envelope_name: string;
  envelope_icon: string;
  envelope_color: string;
  envelope_period: EnvelopePeriod;
};

// ---------- Enveloppes ----------

export async function listEnvelopes(db: SQLiteDatabase): Promise<Envelope[]> {
  return db.getAllAsync<Envelope>('SELECT * FROM envelopes ORDER BY sort_order, id');
}

export async function getEnvelope(db: SQLiteDatabase, id: number): Promise<Envelope | null> {
  return db.getFirstAsync<Envelope>('SELECT * FROM envelopes WHERE id = ?', [id]);
}

/**
 * Enveloppes avec leur budget et leurs dépenses du mois. Une enveloppe
 * hebdomadaire compte les semaines du mois (lundis), une mensuelle le mois civil.
 */
export async function listEnvelopesForMonth(
  db: SQLiteDatabase,
  month: MonthKey,
  currentWeek: WeekKey,
): Promise<EnvelopeForMonth[]> {
  const weeks = weeksOfMonth(month);
  const rows = await db.getAllAsync<
    Envelope & { override_cents: number | null; spent_week_based: number; spent_month_based: number; week_spent_cents: number }
  >(
    `SELECT e.*,
       (SELECT amount_cents FROM envelope_months m WHERE m.envelope_id = e.id AND m.month = ?) AS override_cents,
       COALESCE((SELECT SUM(amount_cents) FROM expenses x WHERE x.envelope_id = e.id AND x.week >= ? AND x.week <= ?), 0) AS spent_week_based,
       COALESCE((SELECT SUM(amount_cents) FROM expenses x WHERE x.envelope_id = e.id AND substr(x.date, 1, 7) = ?), 0) AS spent_month_based,
       COALESCE((SELECT SUM(amount_cents) FROM expenses x WHERE x.envelope_id = e.id AND x.week = ?), 0) AS week_spent_cents
     FROM envelopes e
     ORDER BY e.sort_order, e.id`,
    [month, weeks[0], weeks[weeks.length - 1], month, currentWeek],
  );
  return rows
    .map(({ override_cents, spent_week_based, spent_month_based, ...e }) => {
      const amount = override_cents ?? e.weekly_cents;
      return {
        ...e,
        default_cents: e.weekly_cents,
        weekly_cents: amount,
        has_override: override_cents !== null,
        budget_cents: e.period === 'week' ? amount * weeks.length : amount,
        spent_cents: e.period === 'week' ? spent_week_based : spent_month_based,
      };
    })
    // Hors de sa période, une enveloppe n'apparaît que si elle porte des dépenses ce mois-là.
    .filter((e) => isEnvelopeActive(e, month) || e.spent_cents > 0);
}

/** Enveloppes hebdomadaires d'une semaine (montant du mois de la semaine) et leur dépensé. */
export async function listEnvelopesForWeek(db: SQLiteDatabase, week: WeekKey): Promise<EnvelopeWithSpending[]> {
  const list = await listEnvelopesForMonth(db, monthOfWeek(week), week);
  return list
    .filter((e) => e.period === 'week')
    .map(({ default_cents: _d, has_override: _h, budget_cents: _b, spent_cents: _s, week_spent_cents, ...e }) => ({
      ...e,
      spent_cents: week_spent_cents,
    }));
}

/**
 * Crée ou modifie une enveloppe, du point de vue du mois `month` :
 * - création : `scope` 'all' = à partir de ce mois, tous les mois ; 'only' =
 *   ponctuelle, ce mois seulement ;
 * - modification d'une récurrente : 'all' change le montant par défaut (et
 *   retire le montant propre à ce mois), 'only' pose un montant propre à ce mois.
 */
export async function saveEnvelope(
  db: SQLiteDatabase,
  input: {
    id?: number;
    name: string;
    icon: string;
    color: string;
    amountCents: number;
    period: EnvelopePeriod;
    month: MonthKey;
    scope: 'all' | 'only';
  },
): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (!input.id) {
      const start = input.month;
      const end = input.scope === 'only' ? input.month : null;
      await db.runAsync(
        `INSERT INTO envelopes (name, icon, color, weekly_cents, period, start_month, end_month, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM envelopes), datetime('now'))`,
        [input.name, input.icon, input.color, input.amountCents, input.period, start, end],
      );
      return;
    }
    const current = await db.getFirstAsync<Envelope>('SELECT * FROM envelopes WHERE id = ?', [input.id]);
    if (!current) return;
    await db.runAsync('UPDATE envelopes SET name = ?, icon = ?, color = ?, period = ? WHERE id = ?', [
      input.name,
      input.icon,
      input.color,
      input.period,
      input.id,
    ]);
    if (isOneOff(current) || input.scope === 'all') {
      await db.runAsync('UPDATE envelopes SET weekly_cents = ? WHERE id = ?', [input.amountCents, input.id]);
      await db.runAsync('DELETE FROM envelope_months WHERE envelope_id = ? AND month = ?', [input.id, input.month]);
    } else {
      await db.runAsync(
        'INSERT OR REPLACE INTO envelope_months (envelope_id, month, amount_cents) VALUES (?, ?, ?)',
        [input.id, input.month, input.amountCents],
      );
    }
  });
  invalidateQueries();
}

/** Supprime l'enveloppe et toutes ses dépenses. */
export async function deleteEnvelope(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM envelopes WHERE id = ?', [id]);
  invalidateQueries();
}

/**
 * Arrête une enveloppe récurrente à partir de `month` : les mois précédents
 * gardent leur budget et leurs dépenses. Sans historique avant ce mois, elle
 * est simplement supprimée.
 */
export async function stopEnvelope(db: SQLiteDatabase, envelope: Envelope, month: MonthKey): Promise<void> {
  const before = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM expenses WHERE envelope_id = ? AND substr(date, 1, 7) < ?',
    [envelope.id, month],
  );
  if ((envelope.start_month && envelope.start_month >= month) || (before?.n ?? 0) === 0) {
    await db.runAsync('DELETE FROM envelopes WHERE id = ?', [envelope.id]);
  } else {
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE envelopes SET end_month = ? WHERE id = ?', [shiftMonthKey(month, -1), envelope.id]);
      await db.runAsync('DELETE FROM envelope_months WHERE envelope_id = ? AND month >= ?', [envelope.id, month]);
    });
  }
  invalidateQueries();
}

// ---------- Dépenses ----------

const EXPENSE_SELECT = `
  SELECT x.*, e.name AS envelope_name, e.icon AS envelope_icon, e.color AS envelope_color,
    e.period AS envelope_period
  FROM expenses x JOIN envelopes e ON e.id = x.envelope_id`;

/** Condition « la dépense appartient au mois » selon la période de son enveloppe. */
const IN_MONTH = `((e.period = 'week' AND x.week >= ? AND x.week <= ?) OR (e.period = 'month' AND substr(x.date, 1, 7) = ?))`;

function monthParams(month: MonthKey): string[] {
  const weeks = weeksOfMonth(month);
  return [weeks[0], weeks[weeks.length - 1], month];
}

/** Dépenses du mois, d'une période d'enveloppe donnée (Variables = week, postes des Fixes = month). */
export async function listExpensesForMonth(
  db: SQLiteDatabase,
  month: MonthKey,
  period: EnvelopePeriod,
): Promise<Expense[]> {
  return db.getAllAsync<Expense>(
    `${EXPENSE_SELECT} WHERE e.period = ? AND ${IN_MONTH} ORDER BY x.date DESC, x.id DESC`,
    [period, ...monthParams(month)],
  );
}

export async function listExpensesForEnvelope(
  db: SQLiteDatabase,
  envelopeId: number,
  month: MonthKey,
): Promise<Expense[]> {
  return db.getAllAsync<Expense>(
    `${EXPENSE_SELECT} WHERE x.envelope_id = ? AND ${IN_MONTH} ORDER BY x.date DESC, x.id DESC`,
    [envelopeId, ...monthParams(month)],
  );
}

export async function getExpense(db: SQLiteDatabase, id: number): Promise<Expense | null> {
  return db.getFirstAsync<Expense>(`${EXPENSE_SELECT} WHERE x.id = ?`, [id]);
}

export async function saveExpense(
  db: SQLiteDatabase,
  input: { id?: number; envelopeId: number; label: string; amountCents: number; date: string },
): Promise<void> {
  const week = weekKeyOf(input.date);
  if (input.id) {
    await db.runAsync(
      'UPDATE expenses SET envelope_id = ?, label = ?, amount_cents = ?, date = ?, week = ? WHERE id = ?',
      [input.envelopeId, input.label, input.amountCents, input.date, week, input.id],
    );
  } else {
    await db.runAsync(
      "INSERT INTO expenses (envelope_id, label, amount_cents, date, week, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
      [input.envelopeId, input.label, input.amountCents, input.date, week],
    );
  }
  invalidateQueries();
}

export async function deleteExpense(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  invalidateQueries();
}

// ---------- Fin de semaine ----------

export async function isWeekClosed(db: SQLiteDatabase, week: WeekKey): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM week_closures WHERE week = ?', [week]);
  return (row?.n ?? 0) > 0;
}

/**
 * Solde une semaine terminée : son reste est mis de côté dans une poche
 * (si `potId`) ou volontairement laissé. La carte « fin de semaine » disparaît.
 */
export async function closeWeek(
  db: SQLiteDatabase,
  input: { week: WeekKey; potId?: number; amountCents?: number; date: string },
): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (input.potId && input.amountCents && input.amountCents > 0) {
      await db.runAsync(
        "INSERT INTO savings_moves (pot_id, amount_cents, date, note, week, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        [input.potId, input.amountCents, input.date, 'Reste de la semaine', input.week],
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO week_closures (week, closed_at) VALUES (?, datetime('now'))",
      [input.week],
    );
  });
  invalidateQueries();
}
