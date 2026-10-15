import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus, setAccountBalance } from '@/src/features/account/repository';
import { listFixedForMonth, setFixedChecked } from '@/src/features/fixed/repository';
import { addMove, setPlanDone } from '@/src/features/savings/repository';
import { backdateAccount, emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

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

describe('Mon compte', () => {
  it('fin de mois = solde + à créditer − à débiter − reste des enveloppes − épargne à verser', async () => {
    const s = await status();
    expect(s.balance_cents).toBe(100000);
    expect(s.end_of_month_cents).toBe(100000 + 200000 - 80000 - (50000 + 15000) - 20000);
  });

  it('les actions prévues par le plan ne changent ni la fin de mois ni le début de mois déduit', async () => {
    const before = await status();
    await spend(db, OCT, 'Courses', 3000, '2026-10-14');
    const loyer = (await listFixedForMonth(db, OCT)).find((f) => f.name === 'Loyer');
    await setFixedChecked(db, loyer!.id, OCT, true);
    await setPlanDone(db, await vacances(db, OCT), OCT, true, '2026-10-15');
    const after = await status();
    expect(after.balance_cents).toBe(100000 - 3000 - 80000 - 20000);
    expect(after.end_of_month_cents).toBe(before.end_of_month_cents);
    expect(after.implied_start_cents).toBe(before.implied_start_cents);
  });

  it('un dépassement baisse la fin de mois d’autant, sans changer le début de mois déduit', async () => {
    const before = await status();
    await spend(db, OCT, 'Courses', 53000, '2026-10-14');
    const after = await status();
    expect(after.end_of_month_cents).toBe(before.end_of_month_cents - 3000);
    expect(after.implied_start_cents).toBe(before.implied_start_cents);
  });

  it('un virement d’épargne hors plan est expliqué (début de mois déduit inchangé)', async () => {
    const before = await status();
    await addMove(db, { potId: (await vacances(db, OCT)).id, amountCents: 5000, date: '2026-10-15', note: null });
    const after = await status();
    expect(after.end_of_month_cents).toBe(before.end_of_month_cents - 5000);
    expect(after.extra_savings_cents).toBe(5000);
    expect(after.implied_start_cents).toBe(before.implied_start_cents);
  });

  it('ce qui est noté avant la saisie du solde ne compte pas deux fois', async () => {
    await spend(db, OCT, 'Courses', 3000, '2026-10-14');
    raw.exec("UPDATE expenses SET created_at = datetime('now', '-2 minutes')");
    const s = await status();
    expect(s.balance_cents).toBe(100000);
  });
});
