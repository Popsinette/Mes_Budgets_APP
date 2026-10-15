import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus, setAccountBalance } from '@/src/features/account/repository';
import { closeEnvelope, getClosurePrompt, getMonthClosure, setMonthClosureDone, undoClosure } from '@/src/features/closure/repository';
import { closeWeek, deleteEnvelope, listEnvelopesForMonth, resetMonthFromBase } from '@/src/features/envelopes/repository';
import { deleteMove, listMoves } from '@/src/features/savings/repository';
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

const line = async (month: string, name: string) => (await getMonthClosure(db, month)).lines.find((l) => l.name === name)!;
const env = async (month: string, name: string) =>
  (await listEnvelopesForMonth(db, month, '2000-01-03')).find((e) => e.name === name)!;

describe('clôture du mois', () => {
  it('calcule le reste et le dépassement de chaque enveloppe', async () => {
    const courses = await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    await spend(db, SEP, 'Essence', 18000, '2026-09-10');
    const c = await getMonthClosure(db, SEP);
    expect(c.lines.find((l) => l.id === courses)?.remainder_cents).toBe(5000);
    expect((await line(SEP, 'Essence')).remainder_cents).toBe(-3000);
    expect(c.pending).toBe(2);
  });

  it('les restes de semaines déjà mis de côté ne sont pas comptés deux fois', async () => {
    await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    await closeWeek(db, { week: '2026-09-07', potId: (await vacances(db, SEP)).id, amountCents: 2000, date: '2026-09-14' });
    expect((await line(SEP, 'Courses')).remainder_cents).toBe(3000);
  });

  it('mettre le reste de côté : virement vers la cagnotte, le mois s’arrête pile au budget dépensé', async () => {
    const id = await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    const before = await getMonthSummary(db, SEP);
    const pot = await vacances(db, SEP);
    await closeEnvelope(db, { envelopeId: id, action: 'save', potId: pot.id, date: '2026-10-01' });
    expect((await listMoves(db, pot.id))[0]).toMatchObject({ amount_cents: 5000, note: 'Reste de septembre · Courses' });
    const courses = await line(SEP, 'Courses');
    expect(courses.budget_cents).toBe(35000);
    expect(courses.remainder_cents).toBe(0);
    expect(courses.closure?.action).toBe('save');
    expect((await getMonthSummary(db, SEP)).forecast_left_cents).toBe(before.forecast_left_cents + 5000);
  });

  it('reporter un dépassement : le mois suivant a d’autant moins', async () => {
    const id = await spend(db, SEP, 'Courses', 43000, '2026-09-10');
    const sepBefore = (await getMonthSummary(db, SEP)).forecast_left_cents;
    await closeEnvelope(db, { envelopeId: id, action: 'carry', date: '2026-10-01' });
    // Septembre : le dépassement devient du budget, le résultat du mois ne change pas.
    expect((await getMonthSummary(db, SEP)).forecast_left_cents).toBe(sepBefore);
    expect((await getMonthSummary(db, SEP)).overrun_cents).toBe(0);
    // Octobre : Courses = 500 € − 30 €.
    expect((await env(OCT, 'Courses')).budget_cents).toBe(47000);
  });

  it('reporter un reste vers une enveloppe absente du mois suivant la crée', async () => {
    await spend(db, SEP, 'Courses', 1000, '2026-09-10');
    raw.exec("INSERT INTO envelopes (name, icon, color, weekly_cents, period, sort_order, created_at, month) VALUES ('Anniversaire', 'gift-outline', '#C372A8', 6000, 'month', 9, datetime('now'), '2026-09')");
    const anniv = (await env(SEP, 'Anniversaire')).id;
    await closeEnvelope(db, { envelopeId: anniv, action: 'carry', date: '2026-10-01' });
    const oct = await env(OCT, 'Anniversaire');
    expect(oct).toMatchObject({ weekly_cents: 0, budget_cents: 6000 });
  });

  it('couvrir un dépassement par une cagnotte : retrait, et le mois n’est plus en dépassement', async () => {
    const id = await spend(db, SEP, 'Courses', 43000, '2026-09-10');
    const pot = await vacances(db, SEP);
    await closeEnvelope(db, { envelopeId: id, action: 'cover', potId: pot.id, date: '2026-10-01' });
    expect((await listMoves(db, pot.id))[0].amount_cents).toBe(-3000);
    expect((await getMonthSummary(db, SEP)).overrun_cents).toBe(0);
  });

  it('annuler une clôture rétablit tout (budgets, virement, mois suivant)', async () => {
    const id = await spend(db, SEP, 'Courses', 43000, '2026-09-10');
    const sep = await getMonthSummary(db, SEP);
    const oct = await getMonthSummary(db, OCT);
    await closeEnvelope(db, { envelopeId: id, action: 'carry', date: '2026-10-01' });
    await undoClosure(db, id);
    expect(await getMonthSummary(db, SEP)).toEqual(sep);
    expect((await getMonthSummary(db, OCT)).forecast_left_cents).toBe(oct.forecast_left_cents);
    expect((await line(SEP, 'Courses')).closure).toBeNull();
  });

  it('supprimer le virement de clôture rouvre l’enveloppe', async () => {
    const id = await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    const pot = await vacances(db, SEP);
    await closeEnvelope(db, { envelopeId: id, action: 'save', potId: pot.id, date: '2026-10-01' });
    await deleteMove(db, (await listMoves(db, pot.id))[0]);
    expect(await line(SEP, 'Courses')).toMatchObject({ closure: null, remainder_cents: 5000, budget_cents: 40000 });
  });

  it('supprimer l’enveloppe qui a reçu un report annule le report', async () => {
    const id = await spend(db, SEP, 'Courses', 43000, '2026-09-10');
    await closeEnvelope(db, { envelopeId: id, action: 'carry', date: '2026-10-01' });
    await deleteEnvelope(db, (await env(OCT, 'Courses')).id);
    expect(await line(SEP, 'Courses')).toMatchObject({ closure: null, remainder_cents: -3000 });
  });

  it('« Repartir de ma base » garde une enveloppe qui a reçu un report', async () => {
    const id = await spend(db, SEP, 'Courses', 43000, '2026-09-10');
    await closeEnvelope(db, { envelopeId: id, action: 'carry', date: '2026-10-01' });
    await resetMonthFromBase(db, OCT);
    expect((await env(OCT, 'Courses')).budget_cents).toBe(47000);
  });

  it('rappel : le mois précédent tant qu’il reste quelque chose à clôturer', async () => {
    const id = await spend(db, SEP, 'Courses', 35000, '2026-09-10');
    await spend(db, SEP, 'Essence', 15000, '2026-09-10'); // pile au budget : rien à clôturer
    expect((await getClosurePrompt(db, OCT))?.pending).toBe(1);
    await closeEnvelope(db, { envelopeId: id, action: 'carry', date: '2026-10-01' });
    expect(await getClosurePrompt(db, OCT)).toBeNull();
    await undoClosure(db, id);
    await setMonthClosureDone(db, SEP, true);
    expect(await getClosurePrompt(db, OCT)).toBeNull();
  });

  it('clôturer le mois en cours garde le compte cohérent (début de mois déduit inchangé)', async () => {
    await setAccountBalance(db, 100000);
    backdateAccount(raw);
    const courses = await spend(db, OCT, 'Courses', 45000, '2026-10-14');
    const essence = await spend(db, OCT, 'Essence', 18000, '2026-10-14');
    const pot = await vacances(db, OCT);
    const before = (await getAccountStatus(db))!;
    await closeEnvelope(db, { envelopeId: courses, action: 'save', potId: pot.id, date: '2026-10-15' });
    await closeEnvelope(db, { envelopeId: essence, action: 'cover', potId: pot.id, date: '2026-10-15' });
    const after = (await getAccountStatus(db))!;
    expect(after.implied_start_cents).toBe(before.implied_start_cents);
    // Reste versé : la fin de mois ne bouge pas ; dépassement repris d'une cagnotte : +30 €.
    expect(after.end_of_month_cents).toBe(before.end_of_month_cents + 3000);
  });
});
