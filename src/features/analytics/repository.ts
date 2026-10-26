import type { SQLiteDatabase } from 'expo-sqlite';
import { listEnvelopesForMonth, type Expense } from '@/src/features/envelopes/repository';
import { getMonthSummary, SPENDING_GROUPS, type MonthSummary, type SpendingGroup } from '@/src/features/summary/repository';
import { categoryPalette } from '@/src/theme/palette';
import { shiftMonthKey, weeksOfMonth, type MonthKey, type WeekKey } from '@/src/utils/dates';

/**
 * Métriques « où va mon argent » : rien n'est stocké, tout se relit des axes
 * via `getMonthSummary` (mêmes chiffres que la pastille et la Synthèse).
 */

export type FlowKey = SpendingGroup | 'epargne' | 'reste';

export type FlowSlice = { key: FlowKey; label: string; cents: number; color: string | null };

export type MoneyFlow = {
  income_cents: number;
  /** Factures, semaine, montants fixes, santé, épargne programmée, puis ce qui reste (≥ 0). */
  slices: FlowSlice[];
  /** Ce qui dépasse les revenus (dépenses + épargne > revenus), 0 sinon. */
  over_cents: number;
};

/** Couleur de l'épargne dans les graphiques : 5e teinte, voisine validée de « Santé ». */
export const SAVINGS_COLOR = categoryPalette[4];

/** Sur ce que je gagne ce mois-ci : où part chaque euro (dépenses réelles + épargne programmée). */
export function moneyFlowOf(summary: MonthSummary): MoneyFlow {
  const groups = (Object.keys(SPENDING_GROUPS) as SpendingGroup[]).map<FlowSlice>((key) => ({
    key,
    label: SPENDING_GROUPS[key].label,
    cents: summary.spending[key],
    color: SPENDING_GROUPS[key].color,
  }));
  const used = groups.reduce((s, g) => s + g.cents, 0) + summary.savings_planned_cents;
  const left = summary.income_cents - used;
  return {
    income_cents: summary.income_cents,
    slices: [
      ...groups,
      { key: 'epargne', label: 'Épargne', cents: summary.savings_planned_cents, color: SAVINGS_COLOR },
      { key: 'reste', label: 'Reste', cents: Math.max(0, left), color: null },
    ],
    over_cents: Math.max(0, -left),
  };
}

export async function getMoneyFlow(db: SQLiteDatabase, month: MonthKey): Promise<MoneyFlow> {
  return moneyFlowOf(await getMonthSummary(db, month));
}

export type TrendMonth = {
  month: MonthKey;
  income_cents: number;
  spending: Record<SpendingGroup, number>;
  expense_cents: number;
  savings_planned_cents: number;
};

/** Les `count` mois jusqu'à `upTo` inclus : revenus et dépenses par famille. */
export async function getTrend(db: SQLiteDatabase, upTo: MonthKey, count = 6): Promise<TrendMonth[]> {
  const months = Array.from({ length: count }, (_, i) => shiftMonthKey(upTo, i - count + 1));
  const summaries = await Promise.all(months.map((m) => getMonthSummary(db, m)));
  return months.map((month, i) => ({
    month,
    income_cents: summaries[i].income_cents,
    spending: summaries[i].spending,
    expense_cents: summaries[i].expense_cents,
    savings_planned_cents: summaries[i].savings_planned_cents,
  }));
}

export type WeekSpending = { week: WeekKey; spent_cents: number; budget_cents: number };

/** Enveloppes de la semaine : dépensé de chaque semaine du mois face au budget d'une semaine. */
export async function getWeeklySpending(db: SQLiteDatabase, month: MonthKey): Promise<WeekSpending[]> {
  const [rows, envelopes] = await Promise.all([
    db.getAllAsync<{ week: WeekKey; spent: number }>(
      `SELECT x.week AS week, SUM(x.amount_cents) AS spent
       FROM expenses x JOIN envelopes e ON e.id = x.envelope_id
       WHERE e.month = ? AND e.period = 'week'
       GROUP BY x.week`,
      [month],
    ),
    listEnvelopesForMonth(db, month, '2000-01-03'),
  ]);
  const perWeek = envelopes.filter((e) => e.period === 'week').reduce((s, e) => s + e.weekly_cents, 0);
  const spent = new Map(rows.map((r) => [r.week, r.spent]));
  return weeksOfMonth(month).map((week) => ({ week, spent_cents: spent.get(week) ?? 0, budget_cents: perWeek }));
}

/** Les plus grosses dépenses du mois (enveloppes du mois). */
export async function getTopExpenses(db: SQLiteDatabase, month: MonthKey, limit = 5): Promise<Expense[]> {
  return db.getAllAsync<Expense>(
    `SELECT x.*, e.name AS envelope_name, e.icon AS envelope_icon, e.color AS envelope_color,
       e.period AS envelope_period, e.month AS envelope_month
     FROM expenses x JOIN envelopes e ON e.id = x.envelope_id
     WHERE e.month = ?
     ORDER BY x.amount_cents DESC, x.date DESC
     LIMIT ?`,
    [month, limit],
  );
}
