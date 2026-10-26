import type { SQLiteDatabase } from 'expo-sqlite';
import { listEnvelopesForMonth, type Expense } from '@/src/features/envelopes/repository';
import { listFixedForMonth } from '@/src/features/fixed/repository';
import { listHealthForMonth } from '@/src/features/health/repository';
import { listPots, plannedFor } from '@/src/features/savings/repository';
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

// ---------- Flux détaillé (diagramme « Où va mon argent ») ----------

export type FlowItem = { key: string; label: string; cents: number; color: string | null };
export type FlowFamily = FlowItem & { key: FlowKey; items: FlowItem[] };

export type MoneyFlowDetail = {
  income_cents: number;
  /** Revenus du mois, un par ligne (Salaire, CAF…). */
  sources: FlowItem[];
  /** Familles non vides, dans l'ordre fixe, chacune avec ses postes (du plus gros au plus petit). */
  families: FlowFamily[];
  /** Dépenses + épargne au-delà des revenus (0 sinon). */
  over_cents: number;
};

/**
 * Le même découpage que `moneyFlowOf` (mêmes totaux par famille), détaillé
 * poste par poste : chaque facture, chaque enveloppe (dépensé), chaque frais
 * de santé (reste à charge), chaque versement programmé, et le reste.
 */
export async function getMoneyFlowDetail(db: SQLiteDatabase, month: MonthKey): Promise<MoneyFlowDetail> {
  const [summary, fixed, envelopes, health, pots] = await Promise.all([
    getMonthSummary(db, month),
    listFixedForMonth(db, month),
    listEnvelopesForMonth(db, month, '2000-01-03'),
    listHealthForMonth(db, month),
    listPots(db, month),
  ]);
  const flow = moneyFlowOf(summary);
  const byDesc = (a: FlowItem, b: FlowItem) => b.cents - a.cents;
  const color = (key: FlowKey) => flow.slices.find((s) => s.key === key)?.color ?? null;

  const itemsOf: Record<FlowKey, FlowItem[]> = {
    fixes: fixed
      .filter((f) => f.kind === 'charge')
      .map((f) => ({ key: `fix-${f.id}`, label: f.name, cents: f.amount_cents, color: color('fixes') })),
    variables: envelopes
      .filter((e) => e.period === 'week' && e.spent_cents > 0)
      .map((e) => ({ key: `env-${e.id}`, label: e.name, cents: e.spent_cents, color: e.color })),
    postes: envelopes
      .filter((e) => e.period === 'month' && e.spent_cents > 0)
      .map((e) => ({ key: `env-${e.id}`, label: e.name, cents: e.spent_cents, color: e.color })),
    sante:
      flow.slices.find((s) => s.key === 'sante')!.cents > 0
        ? [{ key: 'sante', label: 'Reste à charge', cents: flow.slices.find((s) => s.key === 'sante')!.cents, color: color('sante') }]
        : [],
    epargne: pots
      .filter((p) => plannedFor(p) > 0)
      .map((p) => ({ key: `pot-${p.id}`, label: p.name, cents: plannedFor(p), color: p.color })),
    reste: [],
  };
  // Le détail santé : un poste par frais quand la somme tombe juste (sinon, un seul poste « reste à charge »).
  const healthItems = health
    .map((h) => ({ key: `sante-${h.id}`, label: h.label, cents: Math.max(0, h.amount_cents - h.refund_cents), color: color('sante') }))
    .filter((h) => h.cents > 0);
  if (healthItems.reduce((s, h) => s + h.cents, 0) === flow.slices.find((s) => s.key === 'sante')!.cents) {
    itemsOf.sante = healthItems;
  }

  const families = flow.slices
    .filter((s) => s.cents > 0)
    .map<FlowFamily>((s) => ({
      ...s,
      items: (s.key === 'reste' ? [{ key: 'reste', label: 'Encore libre', cents: s.cents, color: null }] : itemsOf[s.key]).sort(byDesc),
    }));

  return {
    income_cents: flow.income_cents,
    sources: fixed
      .filter((f) => f.kind === 'income' && f.amount_cents > 0)
      .map((f) => ({ key: `inc-${f.id}`, label: f.name, cents: f.amount_cents, color: null }))
      .sort(byDesc),
    families,
    over_cents: flow.over_cents,
  };
}
