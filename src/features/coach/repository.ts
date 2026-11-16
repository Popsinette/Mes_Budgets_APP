import type { SQLiteDatabase } from 'expo-sqlite';
import { getWeeklySpending } from '@/src/features/analytics/repository';
import { isMonthReady, listEnvelopesForMonth } from '@/src/features/envelopes/repository';
import {
  goalAdvice,
  listPots,
  plannedFor,
  savePot,
  setMonthPlan,
  type PotWithBalance,
} from '@/src/features/savings/repository';
import { getMonthSummary, getPlanOutlook } from '@/src/features/summary/repository';
import { categoryPalette } from '@/src/theme/palette';
import {
  daysInMonthOf,
  isoDayInMonth,
  monthKeyFromDate,
  monthOfWeek,
  shiftMonthKey,
  shiftWeekKey,
  toIsoDay,
  weekKeyOf,
  type MonthKey,
  type WeekKey,
} from '@/src/utils/dates';

/**
 * Le « coach » : trois aides pour tenir son budget et atteindre ses objectifs.
 * Rien n'est stocké — tout se calcule à partir du plan (`getMonthSummary`),
 * des enveloppes et des cagnottes, avec les mêmes chiffres que le reste de
 * l'app.
 *
 * 1. `checkPurchase`  — « Puis-je me le permettre ? »
 * 2. `getAllocation`  — « Placer mon reste » : répartir l'argent sans place
 *    entre les objectifs en retard, puis la sécurité.
 * 3. `getStreaks`     — séries : semaines dans le budget, mois tenus, jours
 *    sans dépense.
 */

/* ─────────────── 1 · Puis-je me le permettre ? ─────────────── */

export type PurchaseVerdict = 'envelope' | 'plan' | 'savings' | 'wait';

export type PurchaseCheck = {
  amount_cents: number;
  verdict: PurchaseVerdict;
  /** Enveloppes du mois qui ont encore de la place, la plus garnie d'abord. */
  envelopes: Array<{ id: number; name: string; icon: string; color: string; left_cents: number; fits: boolean }>;
  /** Reste prévisionnel du mois (argent sans place) avant l'achat. */
  free_cents: number;
  /** Cagnottes qui pourraient payer l'achat. `goal` = sécurité, ou objectif pas encore atteint. */
  pots: Array<{ id: number; name: string; icon: string; color: string; balance_cents: number; goal: boolean; safety: boolean }>;
  /** Ce que le plan laisse libre chaque mois, en moyenne sur les 3 mois suivants. */
  monthly_free_cents: number;
  /** Mois à attendre en mettant de côté `monthly_free_cents` (null si rien n'est libre). */
  months_to_wait: number | null;
  /** Mois où l'achat devient possible. */
  ready_month: MonthKey | null;
};

export async function checkPurchase(db: SQLiteDatabase, amountCents: number, now: Date = new Date()): Promise<PurchaseCheck> {
  const month = monthKeyFromDate(now);
  const week = weekKeyOf(toIsoDay(now));
  const [summary, envelopes, pots, outlook] = await Promise.all([
    getMonthSummary(db, month),
    listEnvelopesForMonth(db, month, week),
    listPots(db, month),
    getPlanOutlook(db, shiftMonthKey(month, 1), 3),
  ]);
  const withRoom = envelopes
    .map((e) => ({
      id: e.id,
      name: e.name,
      icon: e.icon,
      color: e.color,
      left_cents: e.budget_cents - e.spent_cents,
    }))
    .filter((e) => e.left_cents > 0)
    .sort((a, b) => b.left_cents - a.left_cents)
    .map((e) => ({ ...e, fits: e.left_cents >= amountCents }));
  const free = Math.max(0, summary.forecast_left_cents);
  const payers = pots
    .filter((p) => p.balance_cents >= amountCents)
    .map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      color: p.color,
      balance_cents: p.balance_cents,
      safety: p.kind === 'securite',
      goal: p.kind === 'securite' || ((p.target_cents ?? 0) > 0 && p.balance_cents < (p.target_cents ?? 0)),
    }))
    // D'abord l'épargne libre (sans objectif en cours), puis la plus garnie.
    .sort((a, b) => Number(a.goal) - Number(b.goal) || b.balance_cents - a.balance_cents);

  const monthlyFree = Math.max(
    0,
    Math.floor(outlook.reduce((s, m) => s + Math.max(0, m.left_cents), 0) / Math.max(1, outlook.length)),
  );
  const missing = Math.max(0, amountCents - free);
  const monthsToWait = missing === 0 ? 0 : monthlyFree > 0 ? Math.ceil(missing / monthlyFree) : null;

  const verdict: PurchaseVerdict = withRoom.some((e) => e.fits)
    ? 'envelope'
    : free >= amountCents
      ? 'plan'
      : payers.length > 0
        ? 'savings'
        : 'wait';

  return {
    amount_cents: amountCents,
    verdict,
    envelopes: withRoom,
    free_cents: free,
    pots: payers,
    monthly_free_cents: monthlyFree,
    months_to_wait: monthsToWait,
    ready_month: monthsToWait === null ? null : shiftMonthKey(month, monthsToWait),
  };
}

/**
 * Transforme une envie en objectif : une cagnotte « projet » avec l'objectif,
 * le versement mensuel et la date limite calculés par `checkPurchase`.
 */
export async function createWishPot(
  db: SQLiteDatabase,
  input: { name: string; targetCents: number; monthlyCents: number; readyMonth: MonthKey },
): Promise<void> {
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM savings_pots');
  await savePot(db, {
    name: input.name.trim() || 'Mon projet',
    icon: 'gift-outline',
    color: categoryPalette[(count?.n ?? 0) % categoryPalette.length],
    kind: 'projet',
    initialCents: 0,
    targetCents: input.targetCents,
    monthlyCents: Math.min(input.monthlyCents, input.targetCents),
    deadline: isoDayInMonth(input.readyMonth, daysInMonthOf(input.readyMonth)),
  });
}

/* ─────────────── 2 · Placer mon reste ─────────────── */

export type AllocationReason = 'late' | 'goal' | 'safety';

export type AllocationLine = {
  pot: PotWithBalance;
  /** À ajouter au virement de ce mois. */
  extra_cents: number;
  reason: AllocationReason;
};

export type Allocation = {
  month: MonthKey;
  /** Argent du mois sans place (reste prévisionnel, 0 si négatif). */
  free_cents: number;
  lines: AllocationLine[];
  /** Ce qui reste sans place après la proposition. */
  left_cents: number;
};

/**
 * Propose où mettre l'argent du mois qui n'a pas de place, dans cet ordre :
 * 1. les objectifs en retard sur leur date limite (ce qui leur manque ce
 *    mois-ci pour revenir dans les temps, la date la plus proche d'abord) ;
 * 2. la cagnotte de sécurité, s'il y en a une ;
 * 3. sinon les objectifs en cours, la date la plus proche d'abord.
 * Jamais plus que ce qui manque à un objectif. Arrondi à l'euro.
 */
export async function getAllocation(db: SQLiteDatabase, month: MonthKey): Promise<Allocation> {
  const [summary, pots] = await Promise.all([getMonthSummary(db, month), listPots(db, month)]);
  const free = Math.floor(Math.max(0, summary.forecast_left_cents) / 100) * 100;
  let left = free;
  const extras = new Map<number, AllocationLine>();
  const give = (pot: PotWithBalance, wanted: number, reason: AllocationReason) => {
    const amount = Math.floor(Math.min(wanted, left) / 100) * 100;
    if (amount <= 0) return;
    left -= amount;
    const line = extras.get(pot.id);
    if (line) line.extra_cents += amount;
    else extras.set(pot.id, { pot, extra_cents: amount, reason });
  };
  /** Ce qui manque encore à l'objectif une fois le virement prévu du mois et la proposition comptés. */
  const room = (pot: PotWithBalance) => {
    const target = pot.target_cents ?? 0;
    if (target <= 0) return Infinity;
    const pending = pot.plan_done === 1 ? 0 : plannedFor(pot);
    return Math.max(0, target - pot.balance_cents - pending - (extras.get(pot.id)?.extra_cents ?? 0));
  };
  const byDeadline = (a: PotWithBalance, b: PotWithBalance) =>
    (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.id - b.id;
  const goals = pots.filter((p) => p.kind === 'projet' && (p.target_cents ?? 0) > p.balance_cents).sort(byDeadline);

  for (const pot of goals) {
    const advice = goalAdvice(pot, month);
    if (advice.on_track !== false || advice.needed_monthly_cents === null) continue;
    give(pot, Math.min(room(pot), advice.needed_monthly_cents - plannedFor(pot)), 'late');
  }
  const safety = pots.find((p) => p.kind === 'securite');
  if (safety) give(safety, room(safety), 'safety');
  for (const pot of goals) give(pot, room(pot), 'goal');

  return { month, free_cents: free, lines: [...extras.values()], left_cents: left };
}

/**
 * Applique la proposition : le virement de CE mois de chaque cagnotte est
 * augmenté d'autant (le versement mensuel habituel ne change pas). Le reste
 * à répartir du mois baisse du total placé.
 */
export async function applyAllocation(db: SQLiteDatabase, month: MonthKey): Promise<number> {
  const allocation = await getAllocation(db, month);
  for (const line of allocation.lines) {
    await setMonthPlan(db, line.pot, month, {
      amountCents: plannedFor(line.pot) + line.extra_cents,
      date: line.pot.plan_date,
    });
  }
  return allocation.lines.reduce((s, l) => s + l.extra_cents, 0);
}

/* ─────────────── 3 · Séries ─────────────── */

export type Streaks = {
  /** Semaines terminées d'affilée où les enveloppes de la semaine ont tenu. */
  weeks_in_budget: number;
  /** Meilleure série sur les 26 dernières semaines. */
  best_weeks: number;
  /** La semaine en cours tient-elle pour l'instant ? (null sans budget de semaine) */
  week_on_track: boolean | null;
  /** Mois terminés d'affilée sans finir dans le rouge. */
  months_held: number;
  /** Jours du mois en cours (jusqu'à aujourd'hui) sans aucune dépense notée. */
  no_spend_days: number;
};

const MAX_WEEKS = 26;
const MAX_MONTHS = 12;

export async function getStreaks(db: SQLiteDatabase, now: Date = new Date()): Promise<Streaks> {
  const today = toIsoDay(now);
  const currentWeek = weekKeyOf(today);
  const month = monthKeyFromDate(now);

  // Dépensé / budget de chaque semaine, mois par mois (un mois pas ouvert n'a pas de semaine jugée).
  const cache = new Map<MonthKey, Map<WeekKey, { spent: number; budget: number }> | null>();
  const weekOf = async (week: WeekKey) => {
    const m = monthOfWeek(week);
    if (!cache.has(m)) {
      cache.set(
        m,
        (await isMonthReady(db, m))
          ? new Map((await getWeeklySpending(db, m)).map((w) => [w.week, { spent: w.spent_cents, budget: w.budget_cents }]))
          : null,
      );
    }
    return cache.get(m)?.get(week) ?? null;
  };

  const flags: boolean[] = [];
  for (let i = 1, week = shiftWeekKey(currentWeek, -1); i <= MAX_WEEKS; i++, week = shiftWeekKey(week, -1)) {
    const w = await weekOf(week);
    if (!w || w.budget <= 0) break;
    flags.push(w.spent <= w.budget);
  }
  const current = flags.findIndex((ok) => !ok);
  let best = 0;
  let run = 0;
  for (const ok of flags) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const thisWeek = await weekOf(currentWeek);

  let monthsHeld = 0;
  for (let i = 1; i <= MAX_MONTHS; i++) {
    const m = shiftMonthKey(month, -i);
    if (!(await isMonthReady(db, m))) break;
    if ((await getMonthSummary(db, m)).forecast_left_cents < 0) break;
    monthsHeld++;
  }

  const spentDays = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(DISTINCT date) AS n FROM expenses WHERE date >= ? AND date <= ?',
    [`${month}-01`, today],
  );

  return {
    weeks_in_budget: current === -1 ? flags.length : current,
    best_weeks: best,
    week_on_track: thisWeek && thisWeek.budget > 0 ? thisWeek.spent <= thisWeek.budget : null,
    months_held: monthsHeld,
    no_spend_days: Math.max(0, now.getDate() - (spentDays?.n ?? 0)),
  };
}
