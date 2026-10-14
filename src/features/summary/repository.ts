import type { SQLiteDatabase } from 'expo-sqlite';
import { listEnvelopesForMonth } from '@/src/features/envelopes/repository';
import { listFixedForMonth } from '@/src/features/fixed/repository';
import { listHealthForMonth } from '@/src/features/health/repository';
import { getMonthSaved, listPots } from '@/src/features/savings/repository';
import { categoryPalette } from '@/src/theme';
import { currentWeekKey, shiftMonthKey, type MonthKey } from '@/src/utils/dates';

/**
 * Agrégats d'un mois pour la Synthèse et l'Analyse — lus dans les trois axes,
 * jamais stockés. Les dépenses du mois regroupent quatre familles :
 * charges fixes (prévues), budget variable (dépensé), postes mensuels
 * (dépensé) et santé (reste à charge).
 */

export type SpendingGroup = 'fixes' | 'variables' | 'postes' | 'sante';

export const SPENDING_GROUPS: Record<SpendingGroup, { label: string; color: string }> = {
  // Ordre fixe de la palette validée (contraste + daltonisme, clair et sombre).
  fixes: { label: 'Fixes', color: categoryPalette[0] },
  variables: { label: 'Variables', color: categoryPalette[1] },
  postes: { label: 'Postes du mois', color: categoryPalette[2] },
  sante: { label: 'Santé', color: categoryPalette[3] },
};

export type MonthSummary = {
  income_cents: number;
  income_credited_cents: number;
  charges_cents: number;
  charges_paid_cents: number;
  variables_budget_cents: number;
  variables_spent_cents: number;
  postes_budget_cents: number;
  postes_spent_cents: number;
  health_advanced_cents: number;
  health_refund_cents: number;
  /** Dépenses du mois par famille. */
  spending: Record<SpendingGroup, number>;
  expense_cents: number;
  /** Revenus − dépenses : les « économies du mois ». */
  balance_cents: number;
  savings_planned_cents: number;
  savings_done_cents: number;
  pots_total_cents: number;
  pots_count: number;
  /**
   * Plan du mois (montants prévus) : revenus − charges fixes − postes du mois
   * − enveloppes variables (montant × semaines) − épargne programmée.
   */
  plan_left_cents: number;
  /** Dépassements des enveloppes : Σ max(0, dépensé − budget). */
  overrun_cents: number;
  /**
   * Reste prévisionnel = plan − dépassements − santé (reste à charge). Négatif =
   * « dans le rouge » : les dépenses prévues ou faites dépassent les revenus.
   */
  forecast_left_cents: number;
};

export async function getMonthSummary(db: SQLiteDatabase, month: MonthKey): Promise<MonthSummary> {
  const [fixed, envelopes, health, pots, saved] = await Promise.all([
    listFixedForMonth(db, month),
    listEnvelopesForMonth(db, month, currentWeekKey()),
    listHealthForMonth(db, month),
    listPots(db, month),
    getMonthSaved(db, month),
  ]);
  const sum = <T,>(items: T[], pick: (item: T) => number) => items.reduce((s, i) => s + pick(i), 0);

  const incomes = fixed.filter((f) => f.kind === 'income');
  const charges = fixed.filter((f) => f.kind === 'charge');
  const weekly = envelopes.filter((e) => e.period === 'week');
  const monthly = envelopes.filter((e) => e.period === 'month');

  const income = sum(incomes, (i) => i.amount_cents);
  const healthAdvanced = sum(health, (h) => h.amount_cents);
  const healthRefund = sum(health, (h) => h.refund_cents);
  const spending: Record<SpendingGroup, number> = {
    fixes: sum(charges, (c) => c.amount_cents),
    variables: sum(weekly, (e) => e.spent_cents),
    postes: sum(monthly, (e) => e.spent_cents),
    sante: Math.max(0, healthAdvanced - healthRefund),
  };
  const expense = spending.fixes + spending.variables + spending.postes + spending.sante;
  const savingsPlanned = sum(pots, (p) => p.monthly_cents ?? 0);
  const planLeft =
    income -
    spending.fixes -
    sum(monthly, (e) => e.budget_cents) -
    sum(weekly, (e) => e.budget_cents) -
    savingsPlanned;
  const overrun = sum(envelopes, (e) => Math.max(0, e.spent_cents - e.budget_cents));

  return {
    income_cents: income,
    income_credited_cents: sum(incomes.filter((i) => i.checked), (i) => i.amount_cents),
    charges_cents: spending.fixes,
    charges_paid_cents: sum(charges.filter((c) => c.checked), (c) => c.amount_cents),
    variables_budget_cents: sum(weekly, (e) => e.budget_cents),
    variables_spent_cents: spending.variables,
    postes_budget_cents: sum(monthly, (e) => e.budget_cents),
    postes_spent_cents: spending.postes,
    health_advanced_cents: healthAdvanced,
    health_refund_cents: healthRefund,
    spending,
    expense_cents: expense,
    balance_cents: income - expense,
    savings_planned_cents: savingsPlanned,
    savings_done_cents: saved,
    pots_total_cents: sum(pots, (p) => p.balance_cents),
    pots_count: pots.length,
    plan_left_cents: planLeft,
    overrun_cents: overrun,
    forecast_left_cents: planLeft - overrun - spending.sante,
  };
}

export type MonthPoint = { month: MonthKey; income_cents: number; balance_cents: number };

/**
 * Historique des « économies du mois » (revenus − dépenses), du premier mois
 * qui porte des données jusqu'à `upTo` inclus (24 mois au plus).
 */
export async function getBalanceHistory(db: SQLiteDatabase, upTo: MonthKey): Promise<MonthPoint[]> {
  const first = await db.getFirstAsync<{ m: string | null }>(
    `SELECT MIN(m) AS m FROM (
       SELECT MIN(start_month) AS m FROM fixed_items
       UNION ALL SELECT MIN(substr(date, 1, 7)) FROM expenses
       UNION ALL SELECT MIN(substr(date, 1, 7)) FROM health_expenses
     )`,
  );
  if (!first?.m || first.m > upTo) return [];
  const months: MonthKey[] = [];
  for (let m = upTo; m >= first.m && months.length < 24; m = shiftMonthKey(m, -1)) months.unshift(m);
  const summaries = await Promise.all(months.map((m) => getMonthSummary(db, m)));
  return months
    .map((month, i) => ({
      month,
      income_cents: summaries[i].income_cents,
      balance_cents: summaries[i].balance_cents,
    }))
    .filter((p, i) => p.income_cents !== 0 || summaries[i].expense_cents !== 0);
}

export type PlanMonth = {
  month: MonthKey;
  income_cents: number;
  /** Dépenses prévues : charges fixes + enveloppes (budget) + dépassements et santé déjà connus. */
  expense_cents: number;
  savings_cents: number;
  /** Reste prévisionnel du mois (= la pastille) — indépendant du solde du compte. */
  left_cents: number;
};

/** Plan des `count` mois à partir de `from` : revenus, dépenses prévues, épargne, reste. */
export async function getPlanOutlook(db: SQLiteDatabase, from: MonthKey, count = 6): Promise<PlanMonth[]> {
  const months = Array.from({ length: count }, (_, i) => shiftMonthKey(from, i));
  const summaries = await Promise.all(months.map((m) => getMonthSummary(db, m)));
  return months.map((month, i) => {
    const s = summaries[i];
    return {
      month,
      income_cents: s.income_cents,
      expense_cents: s.income_cents - s.savings_planned_cents - s.forecast_left_cents,
      savings_cents: s.savings_planned_cents,
      left_cents: s.forecast_left_cents,
    };
  });
}
