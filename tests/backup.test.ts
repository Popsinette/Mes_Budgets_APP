import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  BACKUP_TABLES,
  buildBackup,
  getBackupStatus,
  markBackupDone,
  parseBackup,
  restoreBackup,
} from '@/src/features/backup/repository';
import { setPlanSkipped } from '@/src/features/savings/repository';
import { getMonthSummary } from '@/src/features/summary/repository';
import { emptyDb } from './helpers/db';
import { seedScenario, spend, vacances } from './helpers/scenario';

let db: SQLiteDatabase;
let raw: DatabaseSync;
beforeEach(async () => {
  ({ db, raw } = await emptyDb());
  await seedScenario(db);
  await spend(db, '2026-10', 'Courses', 4200, '2026-10-06');
  await setPlanSkipped(db, (await vacances(db, '2026-10')).id, '2026-10', true);
});

const dumpAll = () =>
  Object.fromEntries(BACKUP_TABLES.map((t) => [t, raw.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));

describe('sauvegarde et restauration', () => {
  it('restaurer une sauvegarde redonne exactement les mêmes données', async () => {
    const before = dumpAll();
    const summary = await getMonthSummary(db, '2026-10');
    const text = JSON.stringify(await buildBackup(db));

    // On abîme tout, puis on restaure.
    raw.exec("DELETE FROM expenses; UPDATE fixed_items SET amount_cents = 1; INSERT INTO envelope_months_ready (month) VALUES ('2030-01')");
    await restoreBackup(db, parseBackup(text));

    expect(dumpAll()).toEqual(before);
    expect(await getMonthSummary(db, '2026-10')).toEqual(summary);
  });

  it('refuse un fichier qui n’est pas une sauvegarde, sans toucher aux données', async () => {
    expect(() => parseBackup('pas du json')).toThrow(/JSON/);
    expect(() => parseBackup('{"app":"Autre","data":{}}')).toThrow(/pas une sauvegarde/);
    expect(() => parseBackup('{"app":"Mes Budgets","format":1,"data":{"budgets":[]}}')).toThrow(/ancienne version/);
  });

  it('une restauration qui échoue laisse les données intactes', async () => {
    const before = dumpAll();
    const backup = await buildBackup(db);
    // Dépense rattachée à une enveloppe inexistante : contrainte de clé étrangère.
    backup.data.expenses = [{ ...backup.data.expenses![0], envelope_id: 999999 }];
    await expect(restoreBackup(db, backup)).rejects.toThrow();
    expect(dumpAll()).toEqual(before);
  });

  it('une sauvegarde d’avant « Pas ce mois-ci » se restaure (colonnes et tables absentes)', async () => {
    const backup = await buildBackup(db);
    delete backup.data.savings_skips;
    delete backup.data.month_closures;
    backup.data.envelopes = backup.data.envelopes!.map(({ adjust_cents: _drop, ...rest }) => rest);
    await restoreBackup(db, backup);
    expect((raw.prepare('SELECT COUNT(*) AS n FROM savings_skips').get() as { n: number }).n).toBe(0);
    expect((raw.prepare('SELECT MIN(adjust_cents) AS m FROM envelopes').get() as { m: number }).m).toBe(0);
  });

  it('rappelle de sauvegarder quand il y a des données et pas de sauvegarde récente', async () => {
    expect((await getBackupStatus(db)).due).toBe(true);
    await markBackupDone(db, '2026-10-01T10:00:00.000Z');
    expect((await getBackupStatus(db, new Date('2026-10-15T10:00:00Z'))).due).toBe(false);
    const late = await getBackupStatus(db, new Date('2026-11-05T10:00:00Z'));
    expect(late).toMatchObject({ due: true, days: 35 });
  });
});
