import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import { weekKeyOf, weeksOfMonth, type MonthKey, type WeekKey } from '@/src/utils/dates';

/**
 * Enveloppes hebdomadaires (méthode Budgetiz) : un montant par semaine,
 * du lundi au dimanche. Le reste d'une semaine terminée peut être mis de
 * côté dans une poche d'épargne (voir `closeWeek`).
 */

export type Envelope = {
  id: number;
  name: string;
  icon: string;
  color: string;
  weekly_cents: number;
  sort_order: number;
};

export type EnvelopeWithSpending = Envelope & { spent_cents: number };

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
};

// ---------- Enveloppes ----------

export async function listEnvelopes(db: SQLiteDatabase): Promise<Envelope[]> {
  return db.getAllAsync<Envelope>('SELECT * FROM envelopes ORDER BY sort_order, id');
}

export async function getEnvelope(db: SQLiteDatabase, id: number): Promise<Envelope | null> {
  return db.getFirstAsync<Envelope>('SELECT * FROM envelopes WHERE id = ?', [id]);
}

export async function listEnvelopesForWeek(db: SQLiteDatabase, week: WeekKey): Promise<EnvelopeWithSpending[]> {
  return db.getAllAsync<EnvelopeWithSpending>(
    `SELECT e.*, COALESCE(SUM(x.amount_cents), 0) AS spent_cents
     FROM envelopes e
     LEFT JOIN expenses x ON x.envelope_id = e.id AND x.week = ?
     GROUP BY e.id
     ORDER BY e.sort_order, e.id`,
    [week],
  );
}

export async function saveEnvelope(
  db: SQLiteDatabase,
  input: { id?: number; name: string; icon: string; color: string; weeklyCents: number },
): Promise<void> {
  if (input.id) {
    await db.runAsync('UPDATE envelopes SET name = ?, icon = ?, color = ?, weekly_cents = ? WHERE id = ?', [
      input.name,
      input.icon,
      input.color,
      input.weeklyCents,
      input.id,
    ]);
  } else {
    await db.runAsync(
      `INSERT INTO envelopes (name, icon, color, weekly_cents, sort_order, created_at)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM envelopes), datetime('now'))`,
      [input.name, input.icon, input.color, input.weeklyCents],
    );
  }
  invalidateQueries();
}

/** Supprime l'enveloppe et toutes ses dépenses. */
export async function deleteEnvelope(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM envelopes WHERE id = ?', [id]);
  invalidateQueries();
}

// ---------- Dépenses ----------

const EXPENSE_SELECT = `
  SELECT x.*, e.name AS envelope_name, e.icon AS envelope_icon, e.color AS envelope_color
  FROM expenses x JOIN envelopes e ON e.id = x.envelope_id`;

export async function listExpensesForWeek(db: SQLiteDatabase, week: WeekKey): Promise<Expense[]> {
  return db.getAllAsync<Expense>(`${EXPENSE_SELECT} WHERE x.week = ? ORDER BY x.date DESC, x.id DESC`, [week]);
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
      'INSERT INTO expenses (envelope_id, label, amount_cents, date, week) VALUES (?, ?, ?, ?, ?)',
      [input.envelopeId, input.label, input.amountCents, input.date, week],
    );
  }
  invalidateQueries();
}

export async function deleteExpense(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  invalidateQueries();
}

// ---------- Bilan ----------

export type WeekSummary = { week: WeekKey; budget_cents: number; spent_cents: number };

/**
 * Semaines d'un mois (une semaine appartient au mois de son lundi) : budget
 * des enveloppes et total dépensé, semaine par semaine.
 */
export async function getMonthWeeks(db: SQLiteDatabase, month: MonthKey): Promise<WeekSummary[]> {
  const weeks = weeksOfMonth(month);
  const [budget, rows] = await Promise.all([
    db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(weekly_cents), 0) AS total FROM envelopes'),
    db.getAllAsync<{ week: string; spent: number }>(
      `SELECT week, SUM(amount_cents) AS spent FROM expenses
       WHERE week >= ? AND week <= ? GROUP BY week`,
      [weeks[0], weeks[weeks.length - 1]],
    ),
  ]);
  const spentByWeek = new Map(rows.map((r) => [r.week, r.spent]));
  return weeks.map((week) => ({
    week,
    budget_cents: budget?.total ?? 0,
    spent_cents: spentByWeek.get(week) ?? 0,
  }));
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
        'INSERT INTO savings_moves (pot_id, amount_cents, date, note, week) VALUES (?, ?, ?, ?, ?)',
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
