import type { SQLiteDatabase } from 'expo-sqlite';
import { listEnvelopesForMonth } from '@/src/features/envelopes/repository';
import { listFixedForMonth } from '@/src/features/fixed/repository';
import { listPots, plannedFor } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { invalidateQueries } from '@/src/store/invalidation';
import { currentMonthKey, currentWeekKey, weeksOfMonth, type MonthKey } from '@/src/utils/dates';

/**
 * « Mon compte » — un seul compte courant, sans connexion bancaire.
 *
 * On saisit le solde lu sur l'appli de la banque ; il inclut déjà tout ce qui
 * est passé. Le solde estimé ajoute ensuite uniquement ce qui est noté ou
 * coché APRÈS cette saisie (horodatages SQLite UTC comparés à `start_at`) :
 * revenus crédités, charges réglées, dépenses d'enveloppes, frais de santé
 * avancés et remboursements soldés, virements vers / depuis les cagnottes.
 * Aucune écriture n'est créée : tout est relu à chaque affichage.
 */

export type Account = { start_cents: number; start_at: string };

export type AccountStatus = {
  account: Account;
  /** Mouvements depuis la saisie du solde (signés, du point de vue du compte). */
  incomes_cents: number;
  charges_cents: number;
  expenses_cents: number;
  health_cents: number;
  refunds_cents: number;
  savings_cents: number;
  /** Solde estimé maintenant. */
  balance_cents: number;
  /** Encore à venir d'ici la fin du mois courant. */
  upcoming_incomes_cents: number;
  upcoming_charges_cents: number;
  envelopes_left_cents: number;
  /** Dépenses notées mais pas encore pointées (débitées) : à retirer du compte. */
  uncleared_cents: number;
  uncleared_count: number;
  savings_left_cents: number;
  pending_refunds_cents: number;
  /** Solde prévu en fin de mois. */
  end_of_month_cents: number;
  /** Plan du mois (= la pastille « Prévisionnel ») : revenus − toutes les dépenses du mois. */
  month_forecast_cents: number;
  /** Virements d'épargne du mois hors plan (dépôts / retraits manuels). */
  extra_savings_cents: number;
  /**
   * Solde de début de mois déduit : fin de mois − plan du mois + virements
   * hors plan. Sert de contrôle : s'il paraît faux, une coche ou une saisie
   * ne correspond pas à la réalité du compte.
   */
  implied_start_cents: number;
};

export async function getAccount(db: SQLiteDatabase): Promise<Account | null> {
  return db.getFirstAsync<Account>('SELECT start_cents, start_at FROM account WHERE id = 1');
}

/**
 * Saisit (ou remplace) le solde bancaire. `alreadyPassed` : revenus / charges
 * du mois déjà passés sur le compte mais pas encore cochés ; `alreadyCleared` :
 * dépenses déjà débitées mais pas encore pointées. Les uns et les autres sont
 * cochés / pointés juste AVANT l'instant de saisie, pour ne pas être comptés
 * deux fois.
 */
export async function setAccountBalance(
  db: SQLiteDatabase,
  cents: number,
  alreadyPassed: Array<{ itemId: number; month: MonthKey }> = [],
  alreadyCleared: number[] = [],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const id of alreadyCleared) {
      await db.runAsync(
        "UPDATE expenses SET cleared_at = datetime('now', '-1 second') WHERE id = ? AND cleared_at IS NULL",
        [id],
      );
    }
    for (const { itemId, month } of alreadyPassed) {
      await db.runAsync(
        "INSERT OR IGNORE INTO fixed_checks (item_id, month, checked_at) VALUES (?, ?, datetime('now', '-1 second'))",
        [itemId, month],
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO account (id, start_cents, start_at) VALUES (1, ?, datetime('now'))",
      [cents],
    );
  });
  invalidateQueries();
}

export async function getAccountStatus(db: SQLiteDatabase): Promise<AccountStatus | null> {
  const account = await getAccount(db);
  if (!account) return null;
  const since = account.start_at;
  const month = currentMonthKey();

  const weeks = weeksOfMonth(month);
  const [moved, fixed, envelopes, pots, pending, summary, monthMoves] = await Promise.all([
    db.getFirstAsync<{
      incomes: number;
      charges: number;
      expenses: number;
      health: number;
      refunds: number;
      savings: number;
      uncleared: number;
      uncleared_count: number;
    }>(
      `SELECT
         COALESCE((SELECT SUM(f.amount_cents) FROM fixed_checks c JOIN fixed_items f ON f.id = c.item_id
                   WHERE f.kind = 'income' AND c.checked_at > ?), 0) AS incomes,
         COALESCE((SELECT SUM(f.amount_cents) FROM fixed_checks c JOIN fixed_items f ON f.id = c.item_id
                   WHERE f.kind = 'charge' AND c.checked_at > ?), 0) AS charges,
         COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE cleared_at > ?), 0) AS expenses,
         COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE cleared_at IS NULL), 0) AS uncleared,
         (SELECT COUNT(*) FROM expenses WHERE cleared_at IS NULL) AS uncleared_count,
         COALESCE((SELECT SUM(amount_cents) FROM health_expenses WHERE created_at > ?), 0) AS health,
         COALESCE((SELECT SUM(refund_cents) FROM health_expenses WHERE settled = 1 AND settled_at > ?), 0) AS refunds,
         COALESCE((SELECT SUM(amount_cents) FROM savings_moves WHERE created_at > ?), 0) AS savings`,
      [since, since, since, since, since, since],
    ),
    listFixedForMonth(db, month),
    listEnvelopesForMonth(db, month, currentWeekKey()),
    listPots(db, month),
    db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(refund_cents), 0) AS total FROM health_expenses WHERE settled = 0',
    ),
    getMonthSummary(db, month),
    db.getFirstAsync<{ weeks_saved: number; extra: number }>(
      `SELECT
         COALESCE((SELECT SUM(amount_cents) FROM savings_moves
                   WHERE week IN (${weeks.map(() => '?').join(', ')})), 0) AS weeks_saved,
         COALESCE((SELECT SUM(amount_cents) FROM savings_moves
                   WHERE substr(date, 1, 7) = ? AND plan_month IS NULL AND week IS NULL), 0) AS extra`,
      [...weeks, month],
    ),
  ]);

  const m = moved ?? { incomes: 0, charges: 0, expenses: 0, health: 0, refunds: 0, savings: 0, uncleared: 0, uncleared_count: 0 };
  const balance = account.start_cents + m.incomes - m.charges - m.expenses - m.health + m.refunds - m.savings;

  const upcomingIncomes = fixed.filter((f) => f.kind === 'income' && !f.checked).reduce((s, f) => s + f.amount_cents, 0);
  const upcomingCharges = fixed.filter((f) => f.kind === 'charge' && !f.checked).reduce((s, f) => s + f.amount_cents, 0);
  // Enveloppes : le même « Reste » que les cartes et la pastille — budget du
  // mois − dépensé (0 si dépassé). Les restes de semaines déjà mis de côté
  // sont partis vers l'épargne (mouvement déjà compté) : on les retire.
  const weeksSaved = monthMoves?.weeks_saved ?? 0;
  const envelopesLeft = Math.max(
    0,
    envelopes.reduce((s, e) => s + Math.max(0, e.budget_cents - e.spent_cents), 0) - weeksSaved,
  );
  const savingsLeft = pots.filter((p) => p.plan_done !== 1).reduce((s, p) => s + plannedFor(p), 0);
  const pendingRefunds = pending?.total ?? 0;
  // Dépenses à pointer : déjà déduites des enveloppes, pas encore du compte.
  const endOfMonth =
    balance + upcomingIncomes - upcomingCharges - m.uncleared - envelopesLeft - savingsLeft + pendingRefunds;
  const extraSavings = monthMoves?.extra ?? 0;

  return {
    account,
    incomes_cents: m.incomes,
    charges_cents: m.charges,
    expenses_cents: m.expenses,
    health_cents: m.health,
    refunds_cents: m.refunds,
    savings_cents: m.savings,
    balance_cents: balance,
    upcoming_incomes_cents: upcomingIncomes,
    upcoming_charges_cents: upcomingCharges,
    envelopes_left_cents: envelopesLeft,
    uncleared_cents: m.uncleared,
    uncleared_count: m.uncleared_count,
    savings_left_cents: savingsLeft,
    pending_refunds_cents: pendingRefunds,
    end_of_month_cents: endOfMonth,
    month_forecast_cents: summary.forecast_left_cents,
    extra_savings_cents: extraSavings,
    implied_start_cents: endOfMonth - summary.forecast_left_cents + extraSavings,
  };
}

/** "2026-10-14 16:05:00" (UTC) → "14/10 à 18h05" (heure locale). */
export function startLabel(startAt: string): string {
  const date = new Date(`${startAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return startAt;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} à ${date.getHours()}h${pad(date.getMinutes())}`;
}
