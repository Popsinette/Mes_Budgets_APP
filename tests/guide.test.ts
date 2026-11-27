import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus, setAccountBalance } from '@/src/features/account/repository';
import { listEnvelopesForMonth, listTemplates } from '@/src/features/envelopes/repository';
import { saveFixedItem, stopFixedItem } from '@/src/features/fixed/repository';
import { applyReality, getAccountTimeline, getEnvelopeReality, getLevers } from '@/src/features/guide/repository';
import { getTodos } from '@/src/features/handover/repository';
import { savePot, setPlanSkipped } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { setEarlyStarts } from '@/src/utils/dates';
import { backdateAccount, emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

// Scénario : salaire 2 000 € le 1er, loyer 800 € le 5, Courses 100 €/semaine,
// Essence 150 €/mois, Vacances 200 €/mois. On est le jeudi 15 octobre.
const AUG = '2026-08'; // 4 semaines (3/8 → 30/8)
const SEP = '2026-09'; // 4 semaines
const OCT = '2026-10'; // 5 semaines
const NOV = '2026-11';
let db: SQLiteDatabase;
let raw: DatabaseSync;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00'));
  ({ db, raw } = await emptyDb());
  await seedScenario(db);
  setEarlyStarts({});
});
afterEach(() => vi.useRealTimers());

describe('mon compte jusqu’à la fin du mois', () => {
  it('sans compte suivi, pas de courbe', async () => {
    expect(await getAccountTimeline(db)).toBeNull();
  });

  it('la courbe finit sur la fin de mois prévue de « Mon compte »', async () => {
    await saveFixedItem(db, { kind: 'charge', name: 'Internet', amountCents: 3000, day: 20, frequency: 'monthly', startMonth: '2026-01', icon: null });
    await spend(db, OCT, 'Courses', 12000, '2026-10-12');
    await setAccountBalance(db, 50000);
    backdateAccount(raw);
    const t = (await getAccountTimeline(db))!;
    const status = (await getAccountStatus(db))!;
    expect(t.days[0].date).toBe('2026-10-15');
    expect(t.days.at(-1)!.date).toBe('2026-10-31');
    expect(t.days).toHaveLength(17);
    expect(t.end_cents).toBe(status.end_of_month_cents);
    // Salaire (1er) et loyer (5) pas cochés : en retard, donc aujourd'hui ; Internet le 20.
    expect(t.events.map((e) => [e.date, e.label, e.cents])).toEqual([
      ['2026-10-15', 'Salaire', 200000],
      ['2026-10-15', 'Dépenses à pointer', -12000],
      ['2026-10-15', 'Épargne · Vacances', -20000],
      ['2026-10-15', 'Loyer', -80000],
      ['2026-10-20', 'Internet', -3000],
    ]);
  });

  it('signale le découvert avant la paie, et le met dans « À faire »', async () => {
    await saveFixedItem(db, { kind: 'income', name: 'Paie', amountCents: 150000, day: 28, frequency: 'monthly', startMonth: '2026-01', icon: null });
    await setAccountBalance(db, 10000, [
      { itemId: (await db.getFirstAsync<{ id: number }>("SELECT id FROM fixed_items WHERE name = 'Salaire'"))!.id, month: OCT },
      { itemId: (await db.getFirstAsync<{ id: number }>("SELECT id FROM fixed_items WHERE name = 'Loyer'"))!.id, month: OCT },
    ]);
    // Horodatages SQLite à la seconde : on recule les coches faites à la saisie, puis la saisie.
    raw.exec("UPDATE fixed_checks SET checked_at = datetime('now', '-2 minutes')");
    backdateAccount(raw);
    const t = (await getAccountTimeline(db))!;
    // 100 € − 200 € d'épargne aujourd'hui = −100 € dès ce soir, la paie arrive le 28.
    expect(t.first_negative).toBe('2026-10-15');
    expect(t.low.date).toBe('2026-10-27');
    expect(t.low.balance_cents).toBeLessThan(0);
    expect(t.days.find((d) => d.date === '2026-10-28')!.balance_cents).toBeGreaterThan(t.low.balance_cents);
    const todo = (await getTodos(db)).find((x) => x.key === 'low-balance');
    expect(todo).toMatchObject({ cents: t.low.balance_cents, names: ['2026-10-27'] });
  });

  it('pas d’alerte quand le compte reste positif', async () => {
    await setAccountBalance(db, 500000);
    backdateAccount(raw);
    expect((await getAccountTimeline(db))!.first_negative).toBeNull();
    expect((await getTodos(db)).some((x) => x.key === 'low-balance')).toBe(false);
  });
});

describe('retrouver de la marge', () => {
  it('liste ce qui manque, l’épargne à sauter, les enveloppes et les abonnements', async () => {
    await saveFixedItem(db, { kind: 'charge', name: 'Netflix', amountCents: 1399, day: 20, frequency: 'monthly', startMonth: '2026-01', icon: null });
    await spend(db, OCT, 'Essence', 60000, '2026-10-05'); // 450 € de dépassement
    const l = await getLevers(db, OCT);
    // Plan : 2 000 − 800 − 13,99 − 500 − 150 − 200 = 336,01 € ; dépassement 450 € → −113,99 €.
    expect(l.missing_cents).toBe(11399);
    expect(l.savings.map((s) => [s.pot.name, s.cents])).toEqual([['Vacances', 20000]]);
    expect(l.envelopes.map((e) => [e.envelope.name, e.left_cents])).toEqual([['Courses', 50000]]);
    expect(l.subscriptions.map((s) => [s.item.name, s.yearly_cents])).toEqual([
      ['Loyer', 960000],
      ['Netflix', 16788],
    ]);
  });

  it('sauter l’épargne du mois sort du rouge, arrêter un abonnement allège les mois suivants', async () => {
    const netflix = await saveFixedItem(db, { kind: 'charge', name: 'Netflix', amountCents: 1399, day: 20, frequency: 'monthly', startMonth: '2026-01', icon: null });
    void netflix;
    await spend(db, OCT, 'Essence', 60000, '2026-10-05');
    await setPlanSkipped(db, (await vacances(db, OCT)).id, OCT, true);
    const l = await getLevers(db, OCT);
    expect(l.savings).toEqual([]);
    expect((await getMonthSummary(db, OCT)).forecast_left_cents).toBe(-11399 + 20000);

    const nov = (await getMonthSummary(db, NOV)).forecast_left_cents;
    await stopFixedItem(db, l.subscriptions.find((s) => s.item.name === 'Netflix')!.item, NOV);
    expect((await getMonthSummary(db, NOV)).forecast_left_cents).toBe(nov + 1399);
    expect((await getMonthSummary(db, OCT)).charges_cents).toBe(80000 + 1399);
  });
});

describe('mes enveloppes face à la réalité', () => {
  it('compare au dépensé moyen par période et conseille un montant arrondi', async () => {
    // Courses : 600 € en août et 560 € en septembre (4 semaines chacun) → 150 € et 140 € par semaine.
    await spend(db, AUG, 'Courses', 60000, '2026-08-10');
    await spend(db, SEP, 'Courses', 56000, '2026-09-10');
    // Essence : 140 € et 150 € → pile dans le budget de 150 €, rien à proposer.
    await spend(db, AUG, 'Essence', 14000, '2026-08-10');
    await spend(db, SEP, 'Essence', 15000, '2026-09-10');
    const r = await getEnvelopeReality(db, OCT);
    expect(r).toEqual([
      {
        name: 'Courses',
        period: 'week',
        icon: 'cart-outline',
        color: '#C97558',
        current_cents: 10000,
        average_cents: 14500,
        months: 2,
        suggested_cents: 14500,
      },
    ]);
  });

  it('propose aussi de baisser une enveloppe trop large', async () => {
    await spend(db, AUG, 'Essence', 6200, '2026-08-10');
    await spend(db, SEP, 'Essence', 7900, '2026-09-10');
    const r = await getEnvelopeReality(db, OCT);
    expect(r.find((x) => x.name === 'Essence')).toMatchObject({ average_cents: 7050, suggested_cents: 7500 });
  });

  it('un seul mois d’historique ne suffit pas', async () => {
    await spend(db, SEP, 'Courses', 56000, '2026-09-10');
    expect(await getEnvelopeReality(db, OCT)).toEqual([]);
  });

  it('ajuster change le mois et la base, pas les mois déjà ouverts', async () => {
    await spend(db, AUG, 'Courses', 60000, '2026-08-10');
    await spend(db, SEP, 'Courses', 56000, '2026-09-10');
    await applyReality(db, NOV, { name: 'Courses', period: 'week', cents: 14500 });
    const nov = (await listEnvelopesForMonth(db, NOV, '2000-01-03')).find((e) => e.name === 'Courses')!;
    expect(nov).toMatchObject({ weekly_cents: 14500, virtual: false });
    expect((await listTemplates(db)).find((t) => t.name === 'Courses')!.amount_cents).toBe(14500);
    expect((await listEnvelopesForMonth(db, SEP, '2000-01-03')).find((e) => e.name === 'Courses')!.weekly_cents).toBe(10000);
    expect(await getEnvelopeReality(db, NOV)).toEqual([]);
  });
});

// Garde-fou : une cagnotte sans virement prévu n'est pas un levier.
it('une cagnotte sans versement n’apparaît pas dans les leviers', async () => {
  await savePot(db, { name: 'Libre', icon: 'cash-outline', color: '#8B7FE0', kind: 'projet', initialCents: 0, targetCents: null, monthlyCents: null, deadline: null });
  expect((await getLevers(db, OCT)).savings.map((s) => s.pot.name)).toEqual(['Vacances']);
});
