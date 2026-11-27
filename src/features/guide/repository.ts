import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus } from '@/src/features/account/repository';
import {
  isMonthReady,
  listEnvelopesForMonth,
  listTemplates,
  resolveEnvelopeId,
  saveTemplate,
  type EnvelopeForMonth,
  type EnvelopePeriod,
} from '@/src/features/envelopes/repository';
import { listFixedForMonth, type FixedItemForMonth } from '@/src/features/fixed/repository';
import { hasMonthPlan, listPots, plannedFor, type PotWithBalance } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { invalidateQueries } from '@/src/store/invalidation';
import {
  budgetMonthBounds,
  currentMonthKey,
  isoDayInMonth,
  shiftMonthKey,
  toIsoDay,
  weeksOfMonth,
  type MonthKey,
} from '@/src/utils/dates';
import { addDays, differenceInCalendarDays, format, parse } from 'date-fns';

/**
 * Le « guide » : trois aides pour piloter le mois. Rien n'est stocké.
 *
 * 1. `getAccountTimeline` — mon compte jour par jour jusqu'à la fin du mois
 *    (et le point le plus bas : découvert avant la paie ?) ;
 * 2. `getLevers`          — quand le mois est dans le rouge : où retrouver
 *    de la marge (épargne à sauter, enveloppes, abonnements) ;
 * 3. `getEnvelopeReality` — chaque enveloppe face à ce qui est vraiment
 *    dépensé les derniers mois, avec un montant conseillé.
 */

const parseIso = (iso: string) => parse(iso, 'yyyy-MM-dd', new Date());
const dayAfter = (iso: string, n = 1) => format(addDays(parseIso(iso), n), 'yyyy-MM-dd');

/* ─────────────── 1 · Mon compte jusqu'à la fin du mois ─────────────── */

export type TimelineEvent = {
  date: string;
  label: string;
  /** Signé, du point de vue du compte. */
  cents: number;
  kind: 'income' | 'charge' | 'savings' | 'uncleared' | 'refund';
};

export type TimelineDay = { date: string; balance_cents: number };

export type AccountTimeline = {
  month: MonthKey;
  today: string;
  start_cents: number;
  /** Solde prévu chaque soir, d'aujourd'hui au dernier jour du mois. */
  days: TimelineDay[];
  /** Ce qui passe sur le compte (hors dépenses des enveloppes, réparties chaque jour). */
  events: TimelineEvent[];
  /** Dépenses des enveloppes prévues par jour (reste des enveloppes ÷ jours restants). */
  daily_envelopes_cents: number;
  low: TimelineDay;
  /** Premier jour où le compte passerait sous 0 (null s'il reste positif). */
  first_negative: string | null;
  end_cents: number;
};

/**
 * Solde du compte prévu jour par jour jusqu'à la fin du mois en cours. Mêmes
 * chiffres que « Mon compte » : la fin de la courbe = la fin de mois prévue.
 * - revenus / factures pas encore cochés : à leur jour (aujourd'hui s'ils sont
 *   en retard) ;
 * - virements d'épargne prévus pas encore faits : à leur date, sinon aujourd'hui ;
 * - dépenses à pointer : aujourd'hui (elles vont passer) ;
 * - reste des enveloppes : réparti également sur les jours restants ;
 * - remboursements de santé attendus : le dernier jour.
 */
export async function getAccountTimeline(db: SQLiteDatabase, now: Date = new Date()): Promise<AccountTimeline | null> {
  const status = await getAccountStatus(db);
  if (!status) return null;
  const month = currentMonthKey();
  const today = toIsoDay(now);
  const { last: lastDay } = budgetMonthBounds(month);
  const last = lastDay < today ? today : lastDay;
  const [fixed, pots] = await Promise.all([listFixedForMonth(db, month), listPots(db, month)]);
  const at = (date: string) => (date < today ? today : date > last ? last : date);

  const events: TimelineEvent[] = [];
  for (const f of fixed.filter((f) => !f.checked)) {
    events.push({
      date: at(isoDayInMonth(month, f.day)),
      label: f.name,
      cents: f.kind === 'income' ? f.amount_cents : -f.amount_cents,
      kind: f.kind === 'income' ? 'income' : 'charge',
    });
  }
  for (const p of pots.filter((p) => p.plan_done !== 1 && plannedFor(p) > 0)) {
    events.push({ date: at(p.plan_date ?? today), label: `Épargne · ${p.name}`, cents: -plannedFor(p), kind: 'savings' });
  }
  if (status.uncleared_cents > 0) {
    events.push({ date: today, label: 'Dépenses à pointer', cents: -status.uncleared_cents, kind: 'uncleared' });
  }
  if (status.pending_refunds_cents > 0) {
    events.push({ date: last, label: 'Remboursements attendus', cents: status.pending_refunds_cents, kind: 'refund' });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);

  const dayCount = differenceInCalendarDays(parseIso(last), parseIso(today)) + 1;
  const spread = status.envelopes_left_cents;
  const perDay = Math.floor(spread / dayCount);
  let remainder = spread - perDay * dayCount;

  const days: TimelineDay[] = [];
  let balance = status.balance_cents;
  for (let i = 0, date = today; i < dayCount; i++, date = dayAfter(date)) {
    for (const e of events) if (e.date === date) balance += e.cents;
    balance -= perDay + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    days.push({ date, balance_cents: balance });
  }
  const low = days.reduce((min, d) => (d.balance_cents < min.balance_cents ? d : min), days[0]);
  return {
    month,
    today,
    start_cents: status.balance_cents,
    days,
    events,
    daily_envelopes_cents: perDay,
    low,
    first_negative: days.find((d) => d.balance_cents < 0)?.date ?? null,
    end_cents: balance,
  };
}

/* ─────────────── 2 · Retrouver de la marge ─────────────── */

export type Levers = {
  month: MonthKey;
  /** Ce qui manque pour sortir du rouge (0 si le mois tient). */
  missing_cents: number;
  /** Virements d'épargne du mois pas encore faits : « Pas ce mois-ci » les retire du plan. */
  savings: Array<{ pot: PotWithBalance; cents: number }>;
  /** Enveloppes du mois qui ont encore un reste (le plus gros d'abord) : y aller doucement. */
  envelopes: Array<{ envelope: EnvelopeForMonth; left_cents: number }>;
  /** Charges mensuelles, la plus chère d'abord, avec leur coût sur un an. */
  subscriptions: Array<{ item: FixedItemForMonth; yearly_cents: number }>;
};

export async function getLevers(db: SQLiteDatabase, month: MonthKey): Promise<Levers> {
  const [summary, pots, envelopes, fixed] = await Promise.all([
    getMonthSummary(db, month),
    listPots(db, month),
    listEnvelopesForMonth(db, month, '2000-01-03'),
    listFixedForMonth(db, month),
  ]);
  return {
    month,
    missing_cents: Math.max(0, -summary.forecast_left_cents),
    savings: pots
      .filter((p) => hasMonthPlan(p) && p.plan_done !== 1 && plannedFor(p) > 0)
      .map((pot) => ({ pot, cents: plannedFor(pot) }))
      .sort((a, b) => b.cents - a.cents),
    envelopes: envelopes
      .map((envelope) => ({ envelope, left_cents: envelope.budget_cents - envelope.spent_cents }))
      .filter((e) => e.left_cents > 0)
      .sort((a, b) => b.left_cents - a.left_cents),
    subscriptions: fixed
      .filter((f) => f.kind === 'charge' && f.frequency === 'monthly')
      .map((item) => ({ item, yearly_cents: item.amount_cents * 12 }))
      .sort((a, b) => b.yearly_cents - a.yearly_cents),
  };
}

/* ─────────────── 3 · Mes enveloppes face à la réalité ─────────────── */

export type EnvelopeReality = {
  name: string;
  period: EnvelopePeriod;
  icon: string;
  color: string;
  /** Montant prévu pour la période (semaine ou mois) dans le mois visé. */
  current_cents: number;
  /** Dépensé en moyenne par période sur les mois observés. */
  average_cents: number;
  months: number;
  /** Montant conseillé : la moyenne arrondie aux 5 € supérieurs. */
  suggested_cents: number;
};

/** Mois observés pour la moyenne (au plus), et minimum pour proposer un ajustement. */
export const REALITY_LOOKBACK = 3;
const REALITY_MIN_MONTHS = 2;

/**
 * Pour chaque enveloppe de `month`, ce qui a vraiment été dépensé par période
 * (semaine ou mois) sur les derniers mois ouverts, et un montant conseillé.
 * Seules les enveloppes dont le montant s'écarte de la réalité (d'au moins
 * 5 € et 10 %) sont renvoyées ; une enveloppe restée à 0 € n'est pas proposée.
 */
export async function getEnvelopeReality(db: SQLiteDatabase, month: MonthKey): Promise<EnvelopeReality[]> {
  const history: MonthKey[] = [];
  for (let i = 1; i <= 12 && history.length < REALITY_LOOKBACK; i++) {
    const m = shiftMonthKey(month, -i);
    if (await isMonthReady(db, m)) history.push(m);
  }
  const [target, ...past] = await Promise.all([
    listEnvelopesForMonth(db, month, '2000-01-03'),
    ...history.map((m) => listEnvelopesForMonth(db, m, '2000-01-03')),
  ]);
  const result: EnvelopeReality[] = [];
  for (const e of target) {
    const perPeriod: number[] = [];
    past.forEach((list, i) => {
      const same = list.find((x) => x.name === e.name && x.period === e.period);
      if (!same) return;
      perPeriod.push(e.period === 'week' ? same.spent_cents / weeksOfMonth(history[i]).length : same.spent_cents);
    });
    if (perPeriod.length < REALITY_MIN_MONTHS) continue;
    const average = Math.round(perPeriod.reduce((s, v) => s + v, 0) / perPeriod.length);
    // Jamais utilisée sur la période (dépense rare ?) : on laisse décider.
    if (average === 0) continue;
    const suggested = Math.ceil(average / 500) * 500;
    const gap = Math.abs(suggested - e.weekly_cents);
    if (gap < 500 || gap < e.weekly_cents * 0.1) continue;
    result.push({
      name: e.name,
      period: e.period,
      icon: e.icon,
      color: e.color,
      current_cents: e.weekly_cents,
      average_cents: average,
      months: perPeriod.length,
      suggested_cents: suggested,
    });
  }
  return result.sort((a, b) => Math.abs(b.suggested_cents - b.current_cents) - Math.abs(a.suggested_cents - a.current_cents));
}

/**
 * Ajuste une enveloppe à la réalité : son montant dans `month` (le mois est
 * ouvert si besoin) et dans « Ma base », pour les mois suivants.
 */
export async function applyReality(
  db: SQLiteDatabase,
  month: MonthKey,
  input: { name: string; period: EnvelopePeriod; cents: number },
): Promise<void> {
  const envelope = (await listEnvelopesForMonth(db, month, '2000-01-03')).find(
    (e) => e.name === input.name && e.period === input.period,
  );
  if (!envelope) throw new Error(`Enveloppe « ${input.name} » introuvable.`);
  const id = await resolveEnvelopeId(db, envelope);
  if (!id) throw new Error('Enveloppe introuvable.');
  await db.runAsync('UPDATE envelopes SET weekly_cents = ? WHERE id = ?', [input.cents, id]);
  const template = (await listTemplates(db)).find((t) => t.name === input.name && t.period === input.period);
  if (template) await saveTemplate(db, { ...template, amountCents: input.cents });
  invalidateQueries();
}
