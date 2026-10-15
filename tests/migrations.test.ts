import { describe, expect, it } from 'vitest';
import { migrateDatabase } from '@/src/db/schema';
import { memoryDb } from './helpers/db';

describe('migrations', () => {
  it('une installation neuve arrive à la dernière version, avec une base et des cagnottes', async () => {
    const { db, raw } = memoryDb();
    await migrateDatabase(db);
    const version = (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    expect(version).toBeGreaterThanOrEqual(15);
    expect((raw.prepare('SELECT COUNT(*) AS n FROM envelope_templates').get() as { n: number }).n).toBeGreaterThan(0);
    expect((raw.prepare('SELECT COUNT(*) AS n FROM savings_pots').get() as { n: number }).n).toBeGreaterThan(0);
  });

  it('relancer les migrations ne change rien', async () => {
    const { db, raw } = memoryDb();
    await migrateDatabase(db);
    const dump = () => raw.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
    const before = JSON.stringify(dump());
    await migrateDatabase(db);
    expect(JSON.stringify(dump())).toBe(before);
  });
});
