import { addDays, differenceInCalendarDays, getDaysInMonth, parse } from 'date-fns';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  listEnvelopesForMonth,
  resolveEnvelopeId,
  saveExpense,
  type EnvelopePeriod,
} from '@/src/features/envelopes/repository';
import { invalidateQueries } from '@/src/store/invalidation';
import { monthKeyLabel, monthOfWeek, toIsoDay, weekKeyOf, type MonthKey } from '@/src/utils/dates';

/**
 * Habitudes : dépenses qui reviennent sans être des factures (cantine chaque
 * lundi, essence toutes les deux semaines, coiffeur chaque mois…). Rien n'est
 * noté automatiquement : chaque échéance passée est proposée (« À noter »),
 * puis notée en un geste (vraie dépense dans l'enveloppe du même nom) ou
 * ignorée. `habit_logs` garde une ligne par échéance traitée.
 */

export type HabitFrequency = 'weekly' | 'biweekly' | 'monthly';

export const HABIT_FREQUENCY_LABELS: Record<HabitFrequency, string> = {
  weekly: 'Chaque semaine',
  biweekly: 'Toutes les 2 semaines',
  monthly: 'Chaque mois',
};

export type Habit = {
  id: number;
  label: string;
  envelope_name: string;
  envelope_period: EnvelopePeriod;
  amount_cents: number;
  frequency: HabitFrequency;
  /** Première échéance (date ISO) : fixe le jour de la semaine ou du mois. */
  start_date: string;
  created_at: string;
};

export type DueHabit = Habit & { due_date: string };

const parseIso = (iso: string) => parse(iso, 'yyyy-MM-dd', new Date());

/** Échéances d'une habitude entre `from` et `to` inclus (dates ISO). */
export function occurrences(habit: Pick<Habit, 'frequency' | 'start_date'>, from: string, to: string): string[] {
  const start = parseIso(habit.start_date);
  const out: string[] = [];
  if (habit.frequency === 'monthly') {
    const day = start.getDate();
    let y = start.getFullYear();
    let m = start.getMonth();
    for (let guard = 0; guard < 600; guard++) {
      const last = getDaysInMonth(new Date(y, m, 1));
      const iso = toIsoDay(new Date(y, m, Math.min(day, last)));
      if (iso > to) break;
      if (iso >= from) out.push(iso);
      m += 1;
      if (m === 12) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }
  const step = habit.frequency === 'weekly' ? 7 : 14;
  const fromDate = parseIso(from);
  // Première échéance ≥ from (sans boucler depuis le début).
  const skip = Math.max(0, Math.ceil(differenceInCalendarDays(fromDate, start) / step));
  for (let d = addDays(start, skip * step), guard = 0; guard < 600; d = addDays(d, step), guard++) {
    const iso = toIsoDay(d);
    if (iso > to) break;
    if (iso >= from && iso >= habit.start_date) out.push(iso);
  }
  return out;
}

export async function listHabits(db: SQLiteDatabase): Promise<Habit[]> {
  return db.getAllAsync<Habit>('SELECT * FROM expense_habits ORDER BY label');
}

export async function getHabit(db: SQLiteDatabase, id: number): Promise<Habit | null> {
  return db.getFirstAsync<Habit>('SELECT * FROM expense_habits WHERE id = ?', [id]);
}

export async function saveHabit(
  db: SQLiteDatabase,
  input: {
    id?: number;
    label: string;
    envelopeName: string;
    envelopePeriod: EnvelopePeriod;
    amountCents: number;
    frequency: HabitFrequency;
    startDate: string;
  },
): Promise<void> {
  const values = [input.label, input.envelopeName, input.envelopePeriod, input.amountCents, input.frequency, input.startDate];
  if (input.id) {
    await db.runAsync(
      `UPDATE expense_habits SET label = ?, envelope_name = ?, envelope_period = ?, amount_cents = ?, frequency = ?, start_date = ?
       WHERE id = ?`,
      [...values, input.id],
    );
  } else {
    // L'échéance du jour de création est considérée comme déjà notée (on crée
    // souvent l'habitude depuis la dépense qu'on vient de saisir).
    await db.withTransactionAsync(async () => {
      const res = await db.runAsync(
        `INSERT INTO expense_habits (label, envelope_name, envelope_period, amount_cents, frequency, start_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        values,
      );
      await db.runAsync("INSERT OR IGNORE INTO habit_logs (habit_id, due_date, status) VALUES (?, ?, 'done')", [
        Number(res.lastInsertRowId),
        input.startDate,
      ]);
    });
  }
  invalidateQueries();
}

export async function deleteHabit(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM expense_habits WHERE id = ?', [id]);
  invalidateQueries();
}

/** Échéances passées (jusqu'à `today`, sur `lookbackDays` jours) ni notées ni ignorées. */
export async function listDueHabits(db: SQLiteDatabase, today: string, lookbackDays = 31): Promise<DueHabit[]> {
  const from = toIsoDay(addDays(parseIso(today), -lookbackDays));
  const [habits, logs] = await Promise.all([
    listHabits(db),
    db.getAllAsync<{ habit_id: number; due_date: string }>('SELECT habit_id, due_date FROM habit_logs WHERE due_date >= ?', [from]),
  ]);
  const done = new Set(logs.map((l) => `${l.habit_id}:${l.due_date}`));
  return habits
    .flatMap((h) => occurrences(h, from, today).map((due) => ({ ...h, due_date: due })))
    .filter((d) => !done.has(`${d.id}:${d.due_date}`))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** Mois dont l'enveloppe reçoit la dépense : mois du jeudi (semaine) ou mois civil (montant fixe). */
function envelopeMonth(period: EnvelopePeriod, date: string): MonthKey {
  return period === 'week' ? monthOfWeek(weekKeyOf(date)) : date.slice(0, 7);
}

/** Note l'échéance : une vraie dépense dans l'enveloppe du même nom du mois concerné. */
export async function recordHabit(db: SQLiteDatabase, habit: DueHabit): Promise<void> {
  const month = envelopeMonth(habit.envelope_period, habit.due_date);
  const envelope = (await listEnvelopesForMonth(db, month, '2000-01-03')).find(
    (e) => e.name === habit.envelope_name && e.period === habit.envelope_period,
  );
  if (!envelope) {
    throw new Error(`L’enveloppe « ${habit.envelope_name} » n’existe pas en ${monthKeyLabel(month)}.`);
  }
  const envelopeId = await resolveEnvelopeId(db, envelope);
  if (!envelopeId) throw new Error('Enveloppe introuvable.');
  await saveExpense(db, { envelopeId, label: habit.label, amountCents: habit.amount_cents, date: habit.due_date });
  const row = await db.getFirstAsync<{ id: number }>('SELECT MAX(id) AS id FROM expenses');
  await db.runAsync(
    "INSERT OR REPLACE INTO habit_logs (habit_id, due_date, status, expense_id) VALUES (?, ?, 'done', ?)",
    [habit.id, habit.due_date, row?.id ?? null],
  );
  invalidateQueries();
}

export async function skipHabit(db: SQLiteDatabase, habitId: number, dueDate: string): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO habit_logs (habit_id, due_date, status) VALUES (?, ?, 'skipped')", [habitId, dueDate]);
  invalidateQueries();
}
