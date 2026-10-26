import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { upgradeLegacyColors } from '@/src/db/schema';
import { getMoneyFlow, getTopExpenses, getTrend, getWeeklySpending } from '@/src/features/analytics/repository';
import { saveEnvelope } from '@/src/features/envelopes/repository';
import { saveHealthExpense } from '@/src/features/health/repository';
import { addMove, getSavingsProjection, savePot, setPlanDone, setPlanSkipped } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { categoryPalette, LEGACY_PALETTE, seriesColor } from '@/src/theme/palette';
import { emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

const OCT = '2026-10';
let db: SQLiteDatabase;
let raw: DatabaseSync;
beforeEach(async () => {
  ({ db, raw } = await emptyDb());
  await seedScenario(db);
});

describe('où va mon argent', () => {
  it('chaque euro gagné est réparti : factures, semaine, montants fixes, santé, épargne, reste', async () => {
    await spend(db, OCT, 'Courses', 32000, '2026-10-06');
    await spend(db, OCT, 'Essence', 15000, '2026-10-07');
    await saveHealthExpense(db, { label: 'Médecin', date: '2026-10-08', amountCents: 5000, refundCents: 3000, settled: false });
    const flow = await getMoneyFlow(db, OCT);
    const by = Object.fromEntries(flow.slices.map((s) => [s.key, s.cents]));
    expect(by).toEqual({ fixes: 80000, variables: 32000, postes: 15000, sante: 2000, epargne: 20000, reste: 51000 });
    expect(flow.slices.reduce((s, x) => s + x.cents, 0)).toBe(flow.income_cents);
    expect(flow.over_cents).toBe(0);
  });

  it('au-delà des revenus : reste à 0 et dépassement indiqué', async () => {
    await spend(db, OCT, 'Courses', 160000, '2026-10-06');
    const flow = await getMoneyFlow(db, OCT);
    expect(flow.slices.find((s) => s.key === 'reste')?.cents).toBe(0);
    expect(flow.over_cents).toBe(80000 + 160000 + 20000 - 200000);
  });

  it('un montant fixe du mois (coiffure) compte dans les variables, pas dans les factures', async () => {
    await saveEnvelope(db, { month: OCT, name: 'Coiffure', icon: 'cut-outline', color: categoryPalette[5], amountCents: 6000, period: 'month' });
    await spend(db, OCT, 'Coiffure', 6000, '2026-10-10');
    const s = await getMonthSummary(db, OCT);
    expect(s.charges_cents).toBe(80000);
    expect(s.postes_budget_cents).toBe(15000 + 6000);
    expect(s.spending.postes).toBe(6000);
  });
});

describe('tendances et détail', () => {
  it('6 mois de revenus et de dépenses, du plus ancien au plus récent', async () => {
    await spend(db, '2026-09', 'Courses', 10000, '2026-09-10');
    const trend = await getTrend(db, OCT, 6);
    expect(trend.map((t) => t.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(trend[4].spending.variables).toBe(10000);
    expect(trend[5].income_cents).toBe(200000);
  });

  it('semaine par semaine : dépensé et budget d’une semaine', async () => {
    await spend(db, OCT, 'Courses', 8000, '2026-10-06');
    await spend(db, OCT, 'Courses', 12000, '2026-10-14');
    await spend(db, OCT, 'Essence', 5000, '2026-10-14'); // montant du mois : pas dans les semaines
    const weeks = await getWeeklySpending(db, OCT);
    expect(weeks.map((w) => w.spent_cents)).toEqual([0, 8000, 12000, 0, 0]);
    expect(weeks.every((w) => w.budget_cents === 10000)).toBe(true);
  });

  it('les plus grosses dépenses d’abord', async () => {
    await spend(db, OCT, 'Courses', 2000, '2026-10-06');
    await spend(db, OCT, 'Essence', 6000, '2026-10-07');
    await spend(db, OCT, 'Courses', 4000, '2026-10-08');
    expect((await getTopExpenses(db, OCT, 2)).map((x) => x.amount_cents)).toEqual([6000, 4000]);
  });
});

describe('projection du plan d’épargne', () => {
  it('fin d’année = solde + versements programmés restants', async () => {
    const pot = await vacances(db, OCT);
    await addMove(db, { potId: pot.id, amountCents: 50000, date: '2026-10-01', note: null });
    const p = await getSavingsProjection(db, OCT, '2026-12');
    expect(p.now_cents).toBe(50000);
    expect(p.months.map((m) => m.total_cents)).toEqual([70000, 90000, 110000]);
    expect(p.end_cents).toBe(110000);
  });

  it('versement du mois déjà fait : pas compté deux fois ; mois sauté : rien', async () => {
    const pot = await vacances(db, OCT);
    await setPlanDone(db, pot, OCT, true, '2026-10-05');
    await setPlanSkipped(db, pot.id, '2026-11', true);
    const p = await getSavingsProjection(db, OCT, '2026-12');
    expect(p.months.map((m) => m.total_cents)).toEqual([20000, 20000, 40000]);
  });

  it('les versements s’arrêtent à l’objectif', async () => {
    const pot = await vacances(db, OCT);
    await savePot(db, { id: pot.id, name: pot.name, icon: pot.icon, color: pot.color, kind: pot.kind, initialCents: 0, targetCents: 50000, monthlyCents: 20000, deadline: null });
    const p = await getSavingsProjection(db, OCT, '2027-03');
    expect(p.end_cents).toBe(50000);
    expect(p.pots[0]).toMatchObject({ end_cents: 50000, reaches_target: true });
  });
});

describe('palette pastel', () => {
  it('la migration V18 remplace l’ancienne palette par la nouvelle, au même rang', async () => {
    raw.exec(`UPDATE envelope_templates SET color = '${LEGACY_PALETTE[0]}'; UPDATE savings_pots SET color = '${LEGACY_PALETTE[11].toLowerCase()}'`);
    await upgradeLegacyColors(db);
    expect(raw.prepare('SELECT DISTINCT color FROM envelope_templates').all()).toEqual([{ color: categoryPalette[0] }]);
    expect(raw.prepare('SELECT DISTINCT color FROM savings_pots').all()).toEqual([{ color: categoryPalette[11 % categoryPalette.length] }]);
  });

  it('en mode sombre, une teinte de la palette prend son pas sombre ; une autre couleur reste telle quelle', () => {
    expect(seriesColor(categoryPalette[1], true)).not.toBe(categoryPalette[1]);
    expect(seriesColor(categoryPalette[1], false)).toBe(categoryPalette[1]);
    expect(seriesColor('#123456', true)).toBe('#123456');
  });
});

describe('corriger le montant d’une cagnotte', () => {
  it('le montant saisi devient le solde, l’historique est gardé, le compte n’est pas touché', async () => {
    const { setPotBalance, listMoves, listPots: list } = await import('@/src/features/savings/repository');
    const pot = await vacances(db, OCT);
    await addMove(db, { potId: pot.id, amountCents: 30000, date: '2026-10-01', note: null });
    const movesBefore = raw.prepare('SELECT COUNT(*) AS n FROM savings_moves').get();
    await setPotBalance(db, pot.id, 125000);
    const after = (await list(db, OCT)).find((p) => p.id === pot.id)!;
    expect(after.balance_cents).toBe(125000);
    expect(after.initial_cents).toBe(125000 - 30000);
    expect((await listMoves(db, pot.id)).length).toBe(1);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM savings_moves').get()).toEqual(movesBefore);
  });
});

describe('flux détaillé (diagramme)', () => {
  it('les postes de chaque famille somment au total de la famille, les sources aux revenus', async () => {
    const { getMoneyFlowDetail } = await import('@/src/features/analytics/repository');
    await saveFixedItemCharge(db, 'Internet', 3000);
    await spend(db, OCT, 'Courses', 32000, '2026-10-06');
    await spend(db, OCT, 'Essence', 15000, '2026-10-07');
    await saveHealthExpense(db, { label: 'Médecin', date: '2026-10-08', amountCents: 5000, refundCents: 3000, settled: false });
    const d = await getMoneyFlowDetail(db, OCT);
    const flow = await getMoneyFlow(db, OCT);
    for (const f of d.families) {
      expect(f.items.reduce((s, i) => s + i.cents, 0)).toBe(f.cents);
      expect(flow.slices.find((s) => s.key === f.key)?.cents).toBe(f.cents);
    }
    expect(d.families.map((f) => f.key)).toEqual(['fixes', 'variables', 'postes', 'sante', 'epargne', 'reste']);
    expect(d.families[0].items.map((i) => i.label)).toEqual(['Loyer', 'Internet']);
    expect(d.families[3].items).toEqual([expect.objectContaining({ label: 'Médecin', cents: 2000 })]);
    expect(d.sources.reduce((s, x) => s + x.cents, 0) + d.over_cents).toBe(
      d.families.reduce((s, f) => s + f.cents, 0),
    );
  });

  it('au-delà des revenus : le dépassement comble l’écart, pas de reste', async () => {
    const { getMoneyFlowDetail } = await import('@/src/features/analytics/repository');
    await spend(db, OCT, 'Courses', 160000, '2026-10-06');
    const d = await getMoneyFlowDetail(db, OCT);
    expect(d.families.some((f) => f.key === 'reste')).toBe(false);
    expect(d.over_cents).toBe(60000);
    expect(d.income_cents + d.over_cents).toBe(d.families.reduce((s, f) => s + f.cents, 0));
  });
});

async function saveFixedItemCharge(database: SQLiteDatabase, name: string, cents: number) {
  const { saveFixedItem } = await import('@/src/features/fixed/repository');
  await saveFixedItem(database, { kind: 'charge', name, amountCents: cents, day: 3, frequency: 'monthly', startMonth: '2026-01', icon: null });
}
