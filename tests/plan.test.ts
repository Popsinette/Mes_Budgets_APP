import { beforeEach, describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { saveHealthExpense } from '@/src/features/health/repository';
import { setPlanSkipped } from '@/src/features/savings/repository';
import { getMonthSummary, getPlanOutlook } from '@/src/features/summary/repository';
import { emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

// Octobre 2026 = 5 semaines : Courses = 500 € sur le mois.
const OCT = '2026-10';
const PLAN = 200000 - 80000 - 15000 - 5 * 10000 - 20000; // 350 €

let db: SQLiteDatabase;
beforeEach(async () => {
  ({ db } = await emptyDb());
  await seedScenario(db);
});

describe('plan du mois (getMonthSummary)', () => {
  it('reste à répartir = revenus − charges − postes − variables × semaines − épargne', async () => {
    const s = await getMonthSummary(db, OCT);
    expect(s.variables_budget_cents).toBe(50000);
    expect(s.plan_left_cents).toBe(PLAN);
    expect(s.forecast_left_cents).toBe(PLAN);
  });

  it('dépenser dans son budget ne change pas le prévisionnel', async () => {
    await spend(db, OCT, 'Courses', 3000, '2026-10-06');
    await spend(db, OCT, 'Essence', 15000, '2026-10-07');
    const s = await getMonthSummary(db, OCT);
    expect(s.forecast_left_cents).toBe(PLAN);
    expect(s.expense_cents).toBe(80000 + 3000 + 15000);
  });

  it('un dépassement d’enveloppe retire du prévisionnel', async () => {
    await spend(db, OCT, 'Courses', 52000, '2026-10-06');
    const s = await getMonthSummary(db, OCT);
    expect(s.overrun_cents).toBe(2000);
    expect(s.forecast_left_cents).toBe(PLAN - 2000);
  });

  it('la santé compte pour son reste à charge', async () => {
    await saveHealthExpense(db, { label: 'Médecin', date: '2026-10-08', amountCents: 5000, refundCents: 3000, settled: false });
    const s = await getMonthSummary(db, OCT);
    expect(s.forecast_left_cents).toBe(PLAN - 2000);
  });

  it('« Pas ce mois-ci » sur une cagnotte libère son versement ce mois-là seulement', async () => {
    await setPlanSkipped(db, (await vacances(db, OCT)).id, OCT, true);
    expect((await getMonthSummary(db, OCT)).forecast_left_cents).toBe(PLAN + 20000);
    expect((await getMonthSummary(db, '2026-11')).savings_planned_cents).toBe(20000);
  });

  it('« Les prochains mois » reprennent exactement le prévisionnel de chaque mois', async () => {
    await spend(db, OCT, 'Courses', 52000, '2026-10-06');
    const outlook = await getPlanOutlook(db, OCT, 3);
    for (const m of outlook) {
      const s = await getMonthSummary(db, m.month);
      expect(m.left_cents).toBe(s.forecast_left_cents);
      expect(m.income_cents - m.expense_cents - m.savings_cents).toBe(s.forecast_left_cents);
    }
    // Novembre (4 semaines) suit la base : 400 € de courses.
    expect(outlook[1].left_cents).toBe(200000 - 80000 - 15000 - 4 * 10000 - 20000);
  });
});
