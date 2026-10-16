import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAccountStatus, setAccountBalance } from '@/src/features/account/repository';
import { buildBackup, restoreBackup } from '@/src/features/backup/repository';
import { getExpense, saveExpense, searchExpenses, setExpenseCleared } from '@/src/features/envelopes/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { migrateDatabase } from '@/src/db/schema';
import { backdateAccount, emptyDb, memoryDb } from './helpers/db';
import { seedScenario, spend } from './helpers/scenario';

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

const status = async () => (await getAccountStatus(db))!;

describe('pointage des dépenses', () => {
  it('une dépense notée est « à pointer » : le budget la compte, le solde pas encore', async () => {
    const before = await status();
    await spend(db, OCT, 'Courses', 4000, '2026-10-15');
    const after = await status();
    expect((await getMonthSummary(db, OCT)).variables_spent_cents).toBe(4000);
    expect(after.balance_cents).toBe(before.balance_cents);
    expect(after).toMatchObject({ uncleared_cents: 4000, uncleared_count: 1 });
    // Fin de mois et début de mois déduit : inchangés (la dépense est prévue par le budget).
    expect(after.end_of_month_cents).toBe(before.end_of_month_cents);
    expect(after.implied_start_cents).toBe(before.implied_start_cents);
  });

  it('pointer une dépense la retire du solde, sans changer la fin de mois', async () => {
    await spend(db, OCT, 'Courses', 4000, '2026-10-15');
    const before = await status();
    const id = (await searchExpenses(db, { month: OCT, query: '' }))[0].id;
    await setExpenseCleared(db, id, true);
    const after = await status();
    expect(after.balance_cents).toBe(before.balance_cents - 4000);
    expect(after.uncleared_cents).toBe(0);
    expect(after.end_of_month_cents).toBe(before.end_of_month_cents);
    // Dépointer revient en arrière.
    await setExpenseCleared(db, id, false);
    expect((await status()).balance_cents).toBe(before.balance_cents);
  });

  it('modifier une dépense pointée garde son pointage (et sa date de pointage)', async () => {
    const envelopeId = await spend(db, OCT, 'Courses', 4000, '2026-10-15', true);
    const x = (await searchExpenses(db, { month: OCT, query: '' }))[0];
    await saveExpense(db, { id: x.id, envelopeId, label: 'Marché', amountCents: 4500, date: x.date, cleared: true });
    const updated = await getExpense(db, x.id);
    expect(updated?.cleared_at).toBe(x.cleared_at);
    expect((await status()).balance_cents).toBe(100000 - 4500);
  });

  it('« À pointer » ne liste que les dépenses pas encore pointées', async () => {
    await spend(db, OCT, 'Courses', 4000, '2026-10-14', true);
    await spend(db, OCT, 'Courses', 2500, '2026-10-15');
    const pending = await searchExpenses(db, { month: null, query: '', unclearedOnly: true });
    expect(pending.map((x) => x.amount_cents)).toEqual([2500]);
  });

  it('à la saisie du solde, les dépenses déjà débitées sont pointées juste avant (pas de double compte)', async () => {
    await spend(db, OCT, 'Courses', 4000, '2026-10-14');
    await spend(db, OCT, 'Courses', 2500, '2026-10-15');
    const [recent, older] = await searchExpenses(db, { month: OCT, query: '' });
    await setAccountBalance(db, 90000, [], [older.id]);
    // Horodatages à la seconde : on recule la saisie (et le pointage « juste avant ») d'une minute.
    backdateAccount(raw);
    raw.exec(`UPDATE expenses SET cleared_at = datetime('now', '-61 seconds') WHERE id = ${older.id}`);
    const s = await status();
    // 4 000 déjà dans le solde saisi ; 2 500 encore à pointer.
    expect(s.balance_cents).toBe(90000);
    expect(s).toMatchObject({ uncleared_cents: 2500, uncleared_count: 1 });
    await setExpenseCleared(db, recent.id, true);
    expect((await status()).balance_cents).toBe(90000 - 2500);
  });

  it('une sauvegarde d’avant le pointage restaure ses dépenses comme pointées', async () => {
    await spend(db, OCT, 'Courses', 4000, '2026-10-15');
    const backup = await buildBackup(db);
    backup.format = 3;
    backup.data.expenses = backup.data.expenses!.map(({ cleared_at: _drop, ...rest }) => rest);
    await restoreBackup(db, backup);
    expect((await searchExpenses(db, { month: null, query: '', unclearedOnly: true })).length).toBe(0);
  });
});

describe('migration V17', () => {
  it('les dépenses existantes sont pointées au moment de leur saisie : le solde ne bouge pas', async () => {
    const { db: fresh, raw: r } = memoryDb();
    await migrateDatabase(fresh);
    r.exec('PRAGMA user_version = 16; ALTER TABLE expenses DROP COLUMN cleared_at;');
    const envelopeId = (r.prepare('SELECT id FROM envelopes LIMIT 1').get() as { id: number }).id;
    r.exec(`INSERT INTO expenses (envelope_id, label, amount_cents, date, week, created_at)
            VALUES (${envelopeId}, 'Ancienne', 1000, '2026-10-01', '2026-09-28', '2026-10-01 08:00:00'),
                   (${envelopeId}, 'Très ancienne', 500, '2020-01-01', '2019-12-30', NULL)`);
    await migrateDatabase(fresh);
    const rows = r.prepare('SELECT label, cleared_at FROM expenses ORDER BY id').all();
    expect(rows).toEqual([
      { label: 'Ancienne', cleared_at: '2026-10-01 08:00:00' },
      { label: 'Très ancienne', cleared_at: '1970-01-01 00:00:00' },
    ]);
  });
});
