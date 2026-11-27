import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus, setAccountBalance } from '@/src/features/account/repository';
import { getStreaks } from '@/src/features/coach/repository';
import { listEnvelopesForMonth } from '@/src/features/envelopes/repository';
import { listFixedForMonth, setFixedChecked } from '@/src/features/fixed/repository';
import {
  cancelEarlyStart,
  getHandoverPrompt,
  getTodos,
  loadBudgetCalendar,
  switchToNextMonth,
} from '@/src/features/handover/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import {
  budgetMonthBounds,
  currentMonthKey,
  envelopeMonthOfDay,
  monthDayProgress,
  setEarlyStarts,
} from '@/src/utils/dates';
import { backdateAccount, emptyDb } from './helpers/db';
import { seedScenario, spend } from './helpers/scenario';

// Scénario : salaire 2 000 € le 1er, loyer 800 € le 5, Courses 100 €/semaine,
// Essence 150 €/mois, Vacances 200 €/mois. On est le vendredi 27 novembre.
const NOV = '2026-11';
const DEC = '2026-12';
let db: SQLiteDatabase;
let raw: DatabaseSync;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T12:00:00'));
  ({ db, raw } = await emptyDb());
  await seedScenario(db);
  setEarlyStarts({});
});
afterEach(() => {
  setEarlyStarts({});
  vi.useRealTimers();
});

const env = async (month: string, name: string) =>
  (await listEnvelopesForMonth(db, month, '2000-01-03')).find((e) => e.name === name)!;

describe('passer au mois suivant avant le 1er', () => {
  it('décembre devient le mois en cours dès aujourd’hui', async () => {
    await spend(db, NOV, 'Courses', 30000, '2026-11-10');
    expect(currentMonthKey()).toBe(NOV);
    expect(await switchToNextMonth(db, NOV, { today: '2026-11-27', resetAccount: false })).toBe(DEC);
    expect(currentMonthKey()).toBe(DEC);
    expect(budgetMonthBounds(DEC)).toEqual({ first: '2026-11-27', last: '2026-12-31' });
    expect(budgetMonthBounds(NOV)).toEqual({ first: '2026-11-01', last: '2026-11-26' });
    expect(monthDayProgress(DEC)).toEqual({ day: 1, days: 35 });
    // Novembre est clôturé, plus rien n'est proposé.
    expect(await getHandoverPrompt(db)).toBeNull();
  });

  it('les dépenses datées depuis la bascule vont dans les enveloppes de décembre', async () => {
    await switchToNextMonth(db, NOV, { today: '2026-11-27', resetAccount: false });
    expect(envelopeMonthOfDay('month', '2026-11-26')).toBe(NOV);
    expect(envelopeMonthOfDay('month', '2026-11-28')).toBe(DEC);
    // Semaine du 23/11 (jeudi 26 → novembre) : à partir du 27, décembre.
    expect(envelopeMonthOfDay('week', '2026-11-24')).toBe(NOV);
    expect(envelopeMonthOfDay('week', '2026-11-29')).toBe(DEC);
    // Semaine du 30/11 : décembre de toute façon.
    expect(envelopeMonthOfDay('week', '2026-11-30')).toBe(DEC);

    await spend(db, DEC, 'Essence', 4000, '2026-11-28');
    expect((await env(DEC, 'Essence')).spent_cents).toBe(4000);
    expect((await env(NOV, 'Essence')).spent_cents).toBe(0);
  });

  it('repartir de 0 € puis pointer la paie : le solde suit décembre', async () => {
    await setAccountBalance(db, 35000);
    backdateAccount(raw);
    // Une dépense de novembre jamais pointée : une « miette » oubliée.
    await spend(db, NOV, 'Essence', 5932, '2026-11-20');
    await switchToNextMonth(db, NOV, { today: '2026-11-27', resetAccount: true });
    // Horodatages SQLite à la seconde : on recule la saisie (et la miette soldée juste avant).
    raw.exec("UPDATE expenses SET cleared_at = datetime('now', '-2 minutes') WHERE cleared_at IS NOT NULL");
    backdateAccount(raw);
    let status = (await getAccountStatus(db))!;
    expect(status.balance_cents).toBe(0);
    expect(status.uncleared_count).toBe(0);
    // Fin de décembre prévue = le plan de décembre (rien d'autre n'est encore passé).
    expect(status.end_of_month_cents).toBe((await getMonthSummary(db, DEC)).forecast_left_cents);

    const salary = (await listFixedForMonth(db, DEC)).find((f) => f.name === 'Salaire')!;
    await setFixedChecked(db, salary.id, DEC, true);
    await spend(db, DEC, 'Courses', 6000, '2026-11-28', true);
    status = (await getAccountStatus(db))!;
    expect(status.balance_cents).toBe(200000 - 6000);
    // Cocher et pointer ce que le plan prévoit ne change pas la fin de mois.
    expect(status.end_of_month_cents).toBe((await getMonthSummary(db, DEC)).forecast_left_cents);
  });

  it('les factures de décembre ne sont pas « en retard » fin novembre', async () => {
    await switchToNextMonth(db, NOV, { today: '2026-11-27', resetAccount: false });
    expect((await getTodos(db)).map((t) => t.key)).toEqual([]);
  });

  it('les séries comptent les jours sans dépense depuis la bascule', async () => {
    await switchToNextMonth(db, NOV, { today: '2026-11-27', resetAccount: false });
    vi.setSystemTime(new Date('2026-11-29T12:00:00'));
    await spend(db, DEC, 'Courses', 1000, '2026-11-28');
    expect((await getStreaks(db)).no_spend_days).toBe(3 - 1);
  });

  it('la bascule est retrouvée au redémarrage, et peut être annulée', async () => {
    await spend(db, NOV, 'Courses', 30000, '2026-11-10');
    await switchToNextMonth(db, NOV, { today: '2026-11-27', resetAccount: false });
    setEarlyStarts({}); // l'app est relancée
    expect(currentMonthKey()).toBe(NOV);
    await loadBudgetCalendar(db);
    expect(currentMonthKey()).toBe(DEC);

    await cancelEarlyStart(db, DEC);
    expect(currentMonthKey()).toBe(NOV);
    expect(envelopeMonthOfDay('month', '2026-11-28')).toBe(NOV);
    expect(await getHandoverPrompt(db)).toMatchObject({ kind: 'ending', month: NOV, next: DEC });
  });

  it('après le 1er, passer au mois suivant ne crée pas de début anticipé', async () => {
    vi.setSystemTime(new Date('2026-12-02T12:00:00'));
    await spend(db, NOV, 'Courses', 30000, '2026-11-10');
    await switchToNextMonth(db, NOV, { today: '2026-12-02', resetAccount: false });
    expect(budgetMonthBounds(DEC).first).toBe('2026-12-01');
    expect(currentMonthKey()).toBe(DEC);
  });
});
