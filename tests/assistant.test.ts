import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { changeRatio, getPreviousSpending } from '@/src/features/analytics/repository';
import { saveEnvelope, searchExpenses } from '@/src/features/envelopes/repository';
import { getAnnualCharges, saveFixedItem } from '@/src/features/fixed/repository';
import { listDueHabits, occurrences, recordHabit, saveHabit, skipHabit } from '@/src/features/habits/repository';
import { getExpenseSuggestions, matchSuggestion } from '@/src/features/quick/repository';
import { createProvisionPot, goalAdvice, listPots, savePot, setPlanDone } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { categoryPalette } from '@/src/theme/palette';
import { emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

const OCT = '2026-10';
let db: SQLiteDatabase;
let raw: DatabaseSync;
beforeEach(async () => {
  ({ db, raw } = await emptyDb());
  await seedScenario(db);
});

describe('saisie express', () => {
  it('propose les libellés fréquents avec leur enveloppe et leur montant habituels', async () => {
    for (const [d, c] of [['06', 4500], ['13', 4500], ['20', 5200]] as const) {
      await spend(db, OCT, 'Courses', c, `2026-10-${d}`);
      raw.exec(`UPDATE expenses SET label = 'Carrefour' WHERE id = (SELECT MAX(id) FROM expenses)`);
    }
    await spend(db, OCT, 'Essence', 6000, '2026-10-07');
    const list = await getExpenseSuggestions(db, '2026-10-25');
    expect(list[0]).toMatchObject({ label: 'Carrefour', envelope_name: 'Courses', envelope_period: 'week', amount_cents: 4500, count: 3 });
    expect(matchSuggestion(list, 'carre')?.envelope_name).toBe('Courses');
    expect(matchSuggestion(list, 'ca')).toBeNull();
    expect(matchSuggestion(list, 'essen')?.amount_cents).toBe(6000);
  });
});

describe('habitudes', () => {
  it('échéances hebdomadaires, toutes les 2 semaines et mensuelles', () => {
    expect(occurrences({ frequency: 'weekly', start_date: '2026-10-05' }, '2026-10-01', '2026-10-25')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
    expect(occurrences({ frequency: 'biweekly', start_date: '2026-09-07' }, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-05',
      '2026-10-19',
    ]);
    expect(occurrences({ frequency: 'monthly', start_date: '2026-08-31' }, '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
    ]);
  });

  it('les échéances passées sont proposées ; noter crée la dépense, ignorer la retire', async () => {
    await saveHabit(db, { label: 'Cantine', envelopeName: 'Courses', envelopePeriod: 'week', amountCents: 1200, frequency: 'weekly', startDate: '2026-10-05' });
    let due = await listDueHabits(db, '2026-10-20');
    // L'échéance du jour de création est considérée comme notée.
    expect(due.map((d) => d.due_date)).toEqual(['2026-10-12', '2026-10-19']);
    await recordHabit(db, due[0]);
    await skipHabit(db, due[1].id, due[1].due_date);
    due = await listDueHabits(db, '2026-10-20');
    expect(due).toEqual([]);
    const expenses = await searchExpenses(db, { month: OCT, query: 'cantine' });
    expect(expenses).toEqual([expect.objectContaining({ amount_cents: 1200, date: '2026-10-12', envelope_name: 'Courses' })]);
    expect((await getMonthSummary(db, OCT)).variables_spent_cents).toBe(1200);
  });

  it('noter vers une enveloppe absente du mois : message clair', async () => {
    await saveHabit(db, { label: 'Coiffeur', envelopeName: 'Coiffure', envelopePeriod: 'month', amountCents: 6000, frequency: 'monthly', startDate: '2026-09-14' });
    const [due] = await listDueHabits(db, '2026-10-20');
    await expect(recordHabit(db, due)).rejects.toThrow(/Coiffure/);
    await saveEnvelope(db, { month: OCT, name: 'Coiffure', icon: 'cut-outline', color: categoryPalette[2], amountCents: 6000, period: 'month' });
    await recordHabit(db, due);
    expect((await getMonthSummary(db, OCT)).postes_spent_cents).toBe(6000);
  });
});

describe('objectifs intelligents', () => {
  it('versement nécessaire pour tenir la date limite, et date atteinte au rythme programmé', async () => {
    const pot = await vacances(db, OCT);
    await savePot(db, { id: pot.id, name: pot.name, icon: pot.icon, color: pot.color, kind: pot.kind, initialCents: 50000, targetCents: 200000, monthlyCents: 20000, deadline: '2027-03-01' });
    const p = (await listPots(db, OCT)).find((x) => x.id === pot.id)!;
    // Reste 1 500 € sur 6 versements (oct. → mars) : 250 € par mois ; 200 € ne suffisent pas.
    expect(goalAdvice(p, OCT)).toMatchObject({ missing_cents: 150000, months_left: 6, needed_monthly_cents: 25000, on_track: false, reach_month: '2027-05' });
    // Versement d'octobre fait : 5 versements restants (nov. → mars) pour 1 300 €.
    await setPlanDone(db, p, OCT, true, '2026-10-02');
    const after = (await listPots(db, OCT)).find((x) => x.id === pot.id)!;
    expect(goalAdvice(after, OCT)).toMatchObject({ missing_cents: 130000, months_left: 5, needed_monthly_cents: 26000 });
  });

  it('objectif atteint ou absent', async () => {
    const pot = await vacances(db, OCT);
    expect(goalAdvice(pot, OCT).missing_cents).toBeNull();
    await savePot(db, { id: pot.id, name: pot.name, icon: pot.icon, color: pot.color, kind: pot.kind, initialCents: 50000, targetCents: 40000, monthlyCents: 20000, deadline: null });
    const p = (await listPots(db, OCT)).find((x) => x.id === pot.id)!;
    expect(goalAdvice(p, OCT)).toMatchObject({ missing_cents: 0, on_track: true });
  });
});

describe('comparaison avec le mois précédent', () => {
  it('au même jour du mois, par enveloppe', async () => {
    await spend(db, '2026-09', 'Courses', 3000, '2026-09-08');
    await spend(db, '2026-09', 'Courses', 9000, '2026-09-24');
    const upTo15 = await getPreviousSpending(db, OCT, 15);
    const full = await getPreviousSpending(db, OCT, null);
    expect(upTo15.get('week|Courses')).toBe(3000);
    expect(full.get('week|Courses')).toBe(12000);
    expect(changeRatio(2700, 3000)).toBe(-10);
    expect(changeRatio(100, undefined)).toBeNull();
  });
});

describe('mon année', () => {
  it('charges trimestrielles et annuelles : prochaine échéance et provision mensuelle', async () => {
    await saveFixedItem(db, { kind: 'charge', name: 'Assurance habitation', amountCents: 24000, day: 10, frequency: 'yearly', startMonth: '2026-03', icon: null });
    await saveFixedItem(db, { kind: 'charge', name: 'Eau', amountCents: 9000, day: 5, frequency: 'quarterly', startMonth: '2026-02', icon: null });
    const list = await getAnnualCharges(db, OCT);
    expect(list.map((c) => [c.name, c.next_month, c.months_until, c.monthly_provision_cents])).toEqual([
      ['Eau', '2026-11', 1, 3000],
      ['Assurance habitation', '2027-03', 5, 2000],
    ]);
  });

  it('une provision devient une cagnotte qui atteint le montant avant l’échéance', async () => {
    await createProvisionPot(db, { name: 'Assurance habitation', amountCents: 24000, dueDate: '2027-03-10', fromMonth: OCT, color: categoryPalette[3] });
    const pot = (await listPots(db, OCT)).find((p) => p.name === 'Provision Assurance habitation')!;
    expect(pot).toMatchObject({ target_cents: 24000, monthly_cents: 4800, deadline: '2027-03-10' });
    expect((await getMonthSummary(db, OCT)).savings_planned_cents).toBe(20000 + 4800);
  });
});
