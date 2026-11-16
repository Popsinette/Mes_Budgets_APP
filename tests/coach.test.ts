import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyAllocation,
  checkPurchase,
  createWishPot,
  getAllocation,
  getStreaks,
} from '@/src/features/coach/repository';
import { addMove, listPots, savePot } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

// Scénario : 2 000 € de salaire, 800 € de loyer, Courses 100 €/semaine,
// Essence 150 €/mois, Vacances 200 €/mois.
const OCT = '2026-10'; // 5 semaines → reste à répartir 350 €
let db: SQLiteDatabase;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00')); // jeudi, semaine du 12
  ({ db } = await emptyDb());
  await seedScenario(db);
});
afterEach(() => vi.useRealTimers());

const pot = async (name: string) => (await listPots(db, OCT)).find((p) => p.name === name)!;

describe('puis-je me le permettre ?', () => {
  it('oui si une enveloppe a la place', async () => {
    const c = await checkPurchase(db, 12000);
    expect(c.verdict).toBe('envelope');
    expect(c.envelopes.map((e) => [e.name, e.left_cents, e.fits])).toEqual([
      ['Courses', 50000, true],
      ['Essence', 15000, true],
    ]);
  });

  it('sinon avec l’argent du plan qui n’a pas de place', async () => {
    await spend(db, OCT, 'Courses', 49000, '2026-10-05');
    await spend(db, OCT, 'Essence', 14000, '2026-10-05');
    const c = await checkPurchase(db, 30000);
    expect(c.free_cents).toBe(35000);
    expect(c.verdict).toBe('plan');
  });

  it('sinon avec l’épargne, la cagnotte sans objectif en cours d’abord', async () => {
    await savePot(db, { name: 'Libre', icon: 'cash-outline', color: '#8B7FE0', kind: 'projet', initialCents: 90000, targetCents: null, monthlyCents: null, deadline: null });
    await savePot(db, { name: 'Voiture', icon: 'car-outline', color: '#8B7FE0', kind: 'projet', initialCents: 200000, targetCents: 500000, monthlyCents: null, deadline: null });
    const c = await checkPurchase(db, 80000);
    expect(c.verdict).toBe('savings');
    expect(c.pots.map((p) => [p.name, p.goal])).toEqual([
      ['Libre', false],
      ['Voiture', true],
    ]);
  });

  it('sinon dit combien de mois attendre, et en fait un objectif', async () => {
    // Libre : 350 € en octobre (5 semaines), 450 / 450 / 350 € sur novembre → janvier.
    const c = await checkPurchase(db, 120000);
    expect(c.verdict).toBe('wait');
    expect(c.monthly_free_cents).toBe(Math.floor((45000 + 45000 + 35000) / 3));
    expect(c.months_to_wait).toBe(Math.ceil((120000 - 35000) / c.monthly_free_cents));
    expect(c.ready_month).toBe('2027-01');

    await createWishPot(db, { name: 'Vélo', targetCents: 120000, monthlyCents: c.monthly_free_cents, readyMonth: c.ready_month! });
    expect(await pot('Vélo')).toMatchObject({ kind: 'projet', target_cents: 120000, deadline: '2027-01-31' });
  });

  it('sans rien de libre, pas de date annoncée', async () => {
    await savePot(db, { name: 'Gros', icon: 'cash-outline', color: '#8B7FE0', kind: 'projet', initialCents: 0, targetCents: null, monthlyCents: 60000, deadline: null });
    const c = await checkPurchase(db, 500000);
    expect(c.verdict).toBe('wait');
    expect(c.months_to_wait).toBeNull();
    expect(c.ready_month).toBeNull();
  });
});

describe('placer mon reste', () => {
  it('sert d’abord l’objectif en retard, puis la sécurité', async () => {
    // Noël : 300 € à trouver d'ici décembre avec 50 €/mois → il faut 100 €/mois.
    await savePot(db, { name: 'Noël', icon: 'gift-outline', color: '#8B7FE0', kind: 'projet', initialCents: 0, targetCents: 30000, monthlyCents: 5000, deadline: '2026-12-15' });
    await savePot(db, { name: 'Matelas', icon: 'shield-outline', color: '#8B7FE0', kind: 'securite', initialCents: 0, targetCents: null, monthlyCents: null, deadline: null });
    const a = await getAllocation(db, OCT);
    expect(a.free_cents).toBe(30000); // 350 € − 50 € de Noël
    expect(a.lines.map((l) => [l.pot.name, l.extra_cents, l.reason])).toEqual([
      ['Noël', 5000, 'late'],
      ['Matelas', 25000, 'safety'],
    ]);
    expect(a.left_cents).toBe(0);
  });

  it('appliquer met chaque euro à sa place sans toucher au versement habituel', async () => {
    await savePot(db, { name: 'Noël', icon: 'gift-outline', color: '#8B7FE0', kind: 'projet', initialCents: 0, targetCents: 30000, monthlyCents: 5000, deadline: '2026-12-15' });
    await savePot(db, { name: 'Matelas', icon: 'shield-outline', color: '#8B7FE0', kind: 'securite', initialCents: 0, targetCents: null, monthlyCents: null, deadline: null });
    const before = await getMonthSummary(db, OCT);
    expect(await applyAllocation(db, OCT)).toBe(30000);
    const after = await getMonthSummary(db, OCT);
    expect(after.forecast_left_cents).toBe(before.forecast_left_cents - 30000);
    expect(after.forecast_left_cents).toBe(0);
    expect(await pot('Noël')).toMatchObject({ monthly_cents: 5000, plan_amount_cents: 10000 });
    // Novembre n'a pas bougé.
    expect((await getMonthSummary(db, '2026-11')).savings_planned_cents).toBe(20000 + 5000);
    // Plus rien à placer.
    expect((await getAllocation(db, OCT)).lines).toEqual([]);
  });

  it('ne dépasse jamais ce qui manque à un objectif', async () => {
    await savePot(db, { name: 'Cadeau', icon: 'gift-outline', color: '#8B7FE0', kind: 'projet', initialCents: 9000, targetCents: 10000, monthlyCents: null, deadline: null });
    const a = await getAllocation(db, OCT);
    expect(a.lines.map((l) => [l.pot.name, l.extra_cents, l.reason])).toEqual([['Cadeau', 1000, 'goal']]);
    expect(a.left_cents).toBe(34000);
  });

  it('rien à proposer quand le mois est dans le rouge', async () => {
    await spend(db, OCT, 'Essence', 60000, '2026-10-05');
    const a = await getAllocation(db, OCT);
    expect(a.free_cents).toBe(0);
    expect(a.lines).toEqual([]);
  });
});

describe('séries', () => {
  it('compte les semaines terminées dans le budget, jusqu’au premier dépassement', async () => {
    await spend(db, '2026-09', 'Courses', 9000, '2026-09-22'); // semaine du 21/09 : ok
    await spend(db, OCT, 'Courses', 8000, '2026-09-29'); // semaine du 28/09 (octobre) : ok
    await spend(db, OCT, 'Courses', 10000, '2026-10-06'); // semaine du 5/10 : pile, ok
    await spend(db, OCT, 'Courses', 3000, '2026-10-13'); // semaine en cours
    const s = await getStreaks(db);
    // Septembre ouvert : ses 4 semaines comptent (les 3 premières à 0 €).
    expect(s.weeks_in_budget).toBe(6);
    expect(s.best_weeks).toBe(6);
    expect(s.week_on_track).toBe(true);
  });

  it('un dépassement remet la série à zéro mais garde le record', async () => {
    await spend(db, '2026-09', 'Courses', 9000, '2026-09-22');
    await spend(db, OCT, 'Courses', 13000, '2026-10-06'); // semaine dernière dépassée
    await spend(db, OCT, 'Courses', 12000, '2026-10-13'); // semaine en cours dépassée
    const s = await getStreaks(db);
    expect(s.weeks_in_budget).toBe(0);
    expect(s.best_weeks).toBe(5);
    expect(s.week_on_track).toBe(false);
  });

  it('compte les mois tenus et les jours sans dépense', async () => {
    await spend(db, '2026-08', 'Essence', 90000, '2026-08-10'); // août dans le rouge
    await spend(db, '2026-09', 'Courses', 9000, '2026-09-22');
    await spend(db, OCT, 'Courses', 1000, '2026-10-02');
    await spend(db, OCT, 'Essence', 1000, '2026-10-02');
    await spend(db, OCT, 'Courses', 1000, '2026-10-09');
    const s = await getStreaks(db);
    expect(s.months_held).toBe(1);
    expect(s.no_spend_days).toBe(15 - 2);
  });

  it('sans historique, tout est à zéro', async () => {
    expect(await getStreaks(db)).toEqual({
      weeks_in_budget: 0,
      best_weeks: 0,
      week_on_track: null,
      months_held: 0,
      no_spend_days: 15,
    });
  });
});

// Garde-fou : un virement manuel n'entre pas dans la proposition (hors plan).
it('un dépôt hors plan ne fausse pas la place restante d’un objectif', async () => {
  await savePot(db, { name: 'Cadeau', icon: 'gift-outline', color: '#8B7FE0', kind: 'projet', initialCents: 0, targetCents: 10000, monthlyCents: null, deadline: null });
  await addMove(db, { potId: (await pot('Cadeau')).id, amountCents: 4000, date: '2026-10-10', note: null });
  const a = await getAllocation(db, OCT);
  expect(a.lines[0]).toMatchObject({ extra_cents: 6000 });
  expect((await vacances(db, OCT)).monthly_cents).toBe(20000);
});
