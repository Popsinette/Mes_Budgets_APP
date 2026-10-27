import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus, setAccountBalance } from '@/src/features/account/repository';
import {
  getSavingsProjection,
  hasMonthPlan,
  listMoves,
  listPots,
  plannedFor,
  savePot,
  setMonthPlan,
  setPlanDone,
} from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { backdateAccount, emptyDb } from './helpers/db';
import { seedScenario, vacances } from './helpers/scenario';

const OCT = '2026-10';
let db: SQLiteDatabase;
let raw: DatabaseSync;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00'));
  ({ db, raw } = await emptyDb());
  await seedScenario(db);
  await setAccountBalance(db, 100000);
  backdateAccount(raw);
});
afterEach(() => vi.useRealTimers());

const status = async () => {
  const s = await getAccountStatus(db);
  if (!s) throw new Error('pas de compte');
  return s;
};

describe('Virement du mois d’une cagnotte', () => {
  it('un montant propre au mois remplace le mensuel dans le plan, ce mois-là seulement', async () => {
    const pot = await vacances(db, OCT);
    const before = await getMonthSummary(db, OCT);
    await setMonthPlan(db, pot, OCT, { amountCents: 35000, date: '2026-10-20' });
    const p = await vacances(db, OCT);
    expect(plannedFor(p)).toBe(35000);
    expect(p.plan_date).toBe('2026-10-20');
    const after = await getMonthSummary(db, OCT);
    expect(after.savings_planned_cents).toBe(before.savings_planned_cents + 15000);
    expect(after.plan_left_cents).toBe(before.plan_left_cents - 15000);
    expect(plannedFor(await vacances(db, '2026-11'))).toBe(20000);
  });

  it('pointer le virement planifié crée le dépôt à son montant et sa date, sans changer la fin de mois', async () => {
    const pot = await vacances(db, OCT);
    await setMonthPlan(db, pot, OCT, { amountCents: 12000, date: '2026-10-20' });
    const before = await status();
    await setPlanDone(db, await vacances(db, OCT), OCT, true, '2026-10-15');
    const [move] = await listMoves(db, pot.id);
    expect(move).toMatchObject({ amount_cents: 12000, date: '2026-10-20', plan_month: OCT });
    const after = await status();
    expect(after.balance_cents).toBe(before.balance_cents - 12000);
    expect(after.end_of_month_cents).toBe(before.end_of_month_cents);
    expect(after.implied_start_cents).toBe(before.implied_start_cents);
  });

  it('changer le montant d’un virement déjà pointé met le dépôt à jour ; revenir au mensuel aussi', async () => {
    const pot = await vacances(db, OCT);
    await setPlanDone(db, pot, OCT, true, '2026-10-05');
    await setMonthPlan(db, pot, OCT, { amountCents: 30000, date: '2026-10-05' });
    expect((await listMoves(db, pot.id))[0].amount_cents).toBe(30000);
    const before = await status();
    await setMonthPlan(db, pot, OCT, { amountCents: null, date: null });
    expect((await listMoves(db, pot.id))[0].amount_cents).toBe(20000);
    expect((await vacances(db, OCT)).plan_done).toBe(1);
    const after = await status();
    // Le dépôt baisse de 100 € : le compte garde 100 € de plus, la fin de mois aussi (plan moins chargé).
    expect(after.balance_cents).toBe(before.balance_cents + 10000);
    expect(after.implied_start_cents).toBe(before.implied_start_cents);
  });

  it('0 € = « Pas ce mois-ci »', async () => {
    const pot = await vacances(db, OCT);
    await setPlanDone(db, pot, OCT, true, '2026-10-05');
    await setMonthPlan(db, pot, OCT, { amountCents: 0, date: null });
    const p = await vacances(db, OCT);
    expect(p.plan_skipped).toBe(1);
    expect(plannedFor(p)).toBe(0);
    expect(await listMoves(db, pot.id)).toHaveLength(0);
  });

  it('virement ponctuel vers une cagnotte sans versement mensuel', async () => {
    await savePot(db, {
      name: 'Cadeaux', icon: 'gift-outline', color: '#C9C3F2', kind: 'projet',
      initialCents: 0, targetCents: null, monthlyCents: null, deadline: null,
    });
    const find = async () => (await listPots(db, OCT)).find((p) => p.name === 'Cadeaux')!;
    expect(hasMonthPlan(await find())).toBe(false);
    const before = await getMonthSummary(db, OCT);
    await setMonthPlan(db, await find(), OCT, { amountCents: 8000, date: '2026-10-25' });
    expect(hasMonthPlan(await find())).toBe(true);
    expect((await getMonthSummary(db, OCT)).savings_planned_cents).toBe(before.savings_planned_cents + 8000);
    await setPlanDone(db, await find(), OCT, true, '2026-10-15');
    expect((await find()).balance_cents).toBe(8000);
    expect(plannedFor((await listPots(db, '2026-11')).find((p) => p.name === 'Cadeaux')!)).toBe(0);
  });

  it('la projection d’épargne suit le montant du mois', async () => {
    const pot = await vacances(db, OCT);
    const base = await getSavingsProjection(db, OCT, '2026-12');
    await setMonthPlan(db, pot, '2026-11', { amountCents: 50000, date: null });
    const proj = await getSavingsProjection(db, OCT, '2026-12');
    expect(proj.end_cents - base.end_cents).toBe(30000);
  });
});
