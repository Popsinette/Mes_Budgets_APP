import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus, setAccountBalance } from '@/src/features/account/repository';
import { listEnvelopesForMonth, saveEnvelope } from '@/src/features/envelopes/repository';
import {
  closeAllEnvelopes,
  finishHandover,
  getHandoverPrompt,
  getMonthHandover,
  getTodos,
  settleLate,
  settleLooseEnd,
  startMonthLike,
} from '@/src/features/handover/repository';
import { listMoves } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { backdateAccount, emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

const SEP = '2026-09'; // 4 semaines : Courses = 400 €
const OCT = '2026-10'; // 5 semaines : Courses = 500 €
let db: SQLiteDatabase;
let raw: DatabaseSync;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00'));
  ({ db, raw } = await emptyDb());
  await seedScenario(db);
});
afterEach(() => vi.useRealTimers());

const env = async (month: string, name: string) =>
  (await listEnvelopesForMonth(db, month, '2000-01-03')).find((e) => e.name === name)!;

describe('passage de mois', () => {
  it('liste ce qui reste à cocher et à pointer dans le mois', async () => {
    await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    const h = await getMonthHandover(db, SEP);
    expect(h.next).toBe(OCT);
    expect(h.loose.map((l) => [l.key, l.count, l.cents])).toEqual([
      ['incomes', 1, 200000],
      ['charges', 1, 80000],
      ['expenses', 1, 35000],
      ['savings', 1, 20000],
    ]);
    expect(h.rest_cents).toBe(5000 + 15000);
    expect(h.over_cents).toBe(0);
  });

  it('« tout cocher » solde chaque famille sans changer le plan du mois', async () => {
    await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    const before = await getMonthSummary(db, SEP);
    for (const key of ['incomes', 'charges', 'expenses', 'savings'] as const) {
      await settleLooseEnd(db, SEP, key, '2026-09-30');
    }
    const h = await getMonthHandover(db, SEP);
    expect(h.loose).toEqual([]);
    const after = await getMonthSummary(db, SEP);
    expect(after.forecast_left_cents).toBe(before.forecast_left_cents);
    expect(after.income_credited_cents).toBe(200000);
    expect(after.charges_paid_cents).toBe(80000);
    expect((await listMoves(db, (await vacances(db, SEP)).id))[0]).toMatchObject({ amount_cents: 20000, plan_month: SEP });
  });

  it('tout cocher dans le mois en cours ne change pas la fin de mois prévue du compte', async () => {
    await spend(db, OCT, 'Courses', 12000, '2026-10-10');
    await setAccountBalance(db, 100000);
    backdateAccount(raw);
    const before = await getAccountStatus(db);
    for (const key of ['incomes', 'charges', 'expenses', 'savings'] as const) {
      await settleLooseEnd(db, OCT, key, '2026-10-15');
    }
    const after = await getAccountStatus(db);
    expect(after!.end_of_month_cents).toBe(before!.end_of_month_cents);
    expect(after!.balance_cents).toBe(100000 + 200000 - 80000 - 12000 - 20000);
  });

  it('tout mettre de côté : la cagnotte reçoit les restes moins les dépassements', async () => {
    await spend(db, SEP, 'Courses', 35000, '2026-09-10'); // reste 50 €
    await spend(db, SEP, 'Essence', 18000, '2026-09-10'); // dépassé de 30 €
    const pot = await vacances(db, SEP);
    const before = (await getMonthSummary(db, SEP)).forecast_left_cents;
    const n = await closeAllEnvelopes(db, { month: SEP, action: 'save', potId: pot.id, date: '2026-10-01' });
    expect(n).toBe(2);
    expect((await vacances(db, SEP)).balance_cents).toBe(pot.balance_cents + 5000 - 3000);
    const h = await getMonthHandover(db, SEP);
    expect(h.rest_cents).toBe(0);
    expect(h.over_cents).toBe(0);
    expect(h.closure.pending).toBe(0);
    // Le reste sort du mois (+50 €), le dépassement était déjà compté dans le prévisionnel.
    expect((await getMonthSummary(db, SEP)).forecast_left_cents).toBe(before + 5000 + 3000 - 3000);
  });

  it('tout reporter : le mois suivant reçoit restes et dépassements', async () => {
    await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    await spend(db, SEP, 'Essence', 18000, '2026-09-10');
    await closeAllEnvelopes(db, { month: SEP, action: 'carry', date: '2026-10-01' });
    expect((await env(OCT, 'Courses')).budget_cents).toBe(50000 + 5000);
    expect((await env(OCT, 'Essence')).budget_cents).toBe(15000 - 3000);
    expect((await getMonthHandover(db, SEP)).closure.pending).toBe(0);
  });

  it('mettre de côté sans cagnotte est refusé', async () => {
    await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    await expect(closeAllEnvelopes(db, { month: SEP, action: 'save', date: '2026-10-01' })).rejects.toThrow();
  });

  it('démarrer « comme le mois dernier » reprend ses montants et garde les reports', async () => {
    const id = await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    const courses = await env(SEP, 'Courses');
    await saveEnvelope(db, { ...courses, id, month: SEP, amountCents: 12000, period: 'week' });
    await saveEnvelope(db, { month: SEP, name: 'Cadeaux', icon: 'gift-outline', color: '#C97558', amountCents: 4000, period: 'month' });
    expect((await getMonthHandover(db, SEP)).amounts_differ).toBe(true);
    await closeAllEnvelopes(db, { month: SEP, action: 'carry', date: '2026-10-01' });
    const carried = (await env(OCT, 'Courses')).adjust_cents;

    await startMonthLike(db, OCT, SEP);
    const oct = await env(OCT, 'Courses');
    expect(oct.weekly_cents).toBe(12000);
    expect(oct.adjust_cents).toBe(carried);
    expect((await env(OCT, 'Cadeaux')).weekly_cents).toBe(4000);
    expect((await getMonthHandover(db, SEP)).amounts_differ).toBe(false);
    // Recommencer ne crée pas de doublon.
    await startMonthLike(db, OCT, SEP);
    expect((await listEnvelopesForMonth(db, OCT, '2000-01-03')).filter((e) => e.name === 'Cadeaux')).toHaveLength(1);
  });

  it('le plan du mois suivant est celui de la Synthèse', async () => {
    await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    const h = await getMonthHandover(db, SEP);
    expect(h.next_summary.plan_left_cents).toBe((await getMonthSummary(db, OCT)).plan_left_cents);
    expect(h.next_summary.plan_left_cents).toBe(200000 - 80000 - 50000 - 15000 - 20000);
  });

  it('propose le passage tant que le mois précédent n’est pas terminé', async () => {
    expect(await getHandoverPrompt(db)).toBeNull(); // septembre jamais ouvert
    await spend(db, SEP, 'Courses', 40000, '2026-09-10');
    await spend(db, SEP, 'Essence', 15000, '2026-09-10');
    // Même sans reste à ranger : il faut encore préparer octobre.
    expect(await getHandoverPrompt(db)).toMatchObject({ kind: 'finished', month: SEP, next: OCT, pending: 0 });
    expect(await finishHandover(db, SEP)).toBe(OCT);
    expect(await getHandoverPrompt(db)).toBeNull();
    expect((await env(OCT, 'Courses')).virtual).toBe(false);
  });

  it('propose de préparer le mois suivant dans les derniers jours', async () => {
    await spend(db, SEP, 'Courses', 40000, '2026-09-10');
    await finishHandover(db, SEP);
    expect(await getHandoverPrompt(db, new Date('2026-10-27T12:00:00'))).toBeNull();
    expect(await getHandoverPrompt(db, new Date('2026-10-29T12:00:00'))).toMatchObject({
      kind: 'ending',
      month: OCT,
      next: '2026-11',
      days_left: 2,
    });
  });
});

describe('à faire', () => {
  it('signale factures passées et revenus attendus, puis les solde', async () => {
    const todos = await getTodos(db);
    expect(todos.map((t) => t.key)).toEqual(['late-charges', 'late-incomes']);
    expect(todos[0]).toMatchObject({ count: 1, cents: 80000, names: ['Loyer'] });
    await settleLate(db, 'charge');
    await settleLate(db, 'income');
    expect(await getTodos(db)).toEqual([]);
  });

  it('ne réclame le pointage que si le compte est suivi', async () => {
    await spend(db, OCT, 'Courses', 1200, '2026-10-10');
    expect((await getTodos(db)).some((t) => t.key === 'uncleared')).toBe(false);
    await setAccountBalance(db, 100000);
    const todo = (await getTodos(db)).find((t) => t.key === 'uncleared');
    expect(todo).toMatchObject({ count: 1, cents: 1200 });
  });
});
