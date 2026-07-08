import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';

export type SavingsGoal = {
  id: number;
  name: string;
  icon: string;
  color: string;
  target_cents: number;
  monthly_cents: number | null;
  created_at: string;
};

export type SavingsGoalWithProgress = SavingsGoal & {
  saved_cents: number;
};

export type SavingsEntry = {
  id: number;
  goal_id: number;
  amount_cents: number;
  date: string;
  note: string | null;
};

export async function createSavingsGoal(
  db: SQLiteDatabase,
  input: { name: string; targetCents: number; monthlyCents?: number | null; icon?: string; color?: string },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO savings_goals (name, icon, color, target_cents, monthly_cents, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [
      input.name,
      input.icon ?? 'flag-outline',
      input.color ?? '#6C5CE7',
      input.targetCents,
      input.monthlyCents ?? null,
    ],
  );
  invalidateQueries();
}

export async function deleteSavingsGoal(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM savings_goals WHERE id = ?', [id]);
  invalidateQueries();
}

export async function addSavingsEntry(
  db: SQLiteDatabase,
  input: { goalId: number; amountCents: number; date: string; note?: string },
): Promise<void> {
  await db.runAsync(
    'INSERT INTO savings_entries (goal_id, amount_cents, date, note) VALUES (?, ?, ?, ?)',
    [input.goalId, input.amountCents, input.date, input.note ?? null],
  );
  invalidateQueries();
}

export async function listGoalsWithProgress(db: SQLiteDatabase): Promise<SavingsGoalWithProgress[]> {
  return db.getAllAsync<SavingsGoalWithProgress>(
    `SELECT g.*, COALESCE((
       SELECT SUM(e.amount_cents) FROM savings_entries e WHERE e.goal_id = g.id
     ), 0) AS saved_cents
     FROM savings_goals g
     ORDER BY g.created_at DESC`,
  );
}

/** Somme des versements mensuels prévus sur les objectifs non encore atteints. */
export async function getPlannedMonthlySavings(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ planned: number }>(
    `SELECT COALESCE(SUM(g.monthly_cents), 0) AS planned
     FROM savings_goals g
     WHERE g.monthly_cents IS NOT NULL
       AND (SELECT COALESCE(SUM(e.amount_cents), 0) FROM savings_entries e WHERE e.goal_id = g.id) < g.target_cents`,
  );
  return row?.planned ?? 0;
}

export async function getTotalSavings(db: SQLiteDatabase): Promise<{ saved_cents: number; target_cents: number }> {
  const row = await db.getFirstAsync<{ saved_cents: number; target_cents: number }>(
    `SELECT
       COALESCE((SELECT SUM(amount_cents) FROM savings_entries), 0) AS saved_cents,
       COALESCE((SELECT SUM(target_cents) FROM savings_goals), 0) AS target_cents`,
  );
  return row ?? { saved_cents: 0, target_cents: 0 };
}
