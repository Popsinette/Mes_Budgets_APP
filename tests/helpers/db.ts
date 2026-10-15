import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from '@/src/db/schema';

/**
 * Base SQLite en mémoire qui imite l'API d'expo-sqlite utilisée par les
 * repositories (execAsync, runAsync, getFirstAsync, getAllAsync,
 * withTransactionAsync — sans imbrication, comme sur l'appareil).
 */
export function memoryDb(): { db: SQLiteDatabase; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const params = (p: unknown[] = []) => p as SQLInputValue[];
  const db = {
    execAsync: async (sql: string) => {
      raw.exec(sql);
    },
    runAsync: async (sql: string, p: unknown[] = []) => {
      const r = raw.prepare(sql).run(...params(p));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstAsync: async (sql: string, p: unknown[] = []) => raw.prepare(sql).get(...params(p)) ?? null,
    getAllAsync: async (sql: string, p: unknown[] = []) => raw.prepare(sql).all(...params(p)),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: db as unknown as SQLiteDatabase, raw };
}

/** Base migrée à la dernière version, vidée des données d'exemple. */
export async function emptyDb(): Promise<{ db: SQLiteDatabase; raw: DatabaseSync }> {
  const handle = memoryDb();
  await migrateDatabase(handle.db);
  const tables = handle.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => String((r as { name: string }).name));
  handle.raw.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) handle.raw.exec(`DELETE FROM ${t}`);
  handle.raw.exec('PRAGMA foreign_keys = ON');
  return handle;
}

/** Fait comme si le solde avait été saisi il y a une minute (horodatages SQLite à la seconde). */
export function backdateAccount(raw: DatabaseSync): void {
  raw.exec("UPDATE account SET start_at = datetime('now', '-1 minute') WHERE id = 1");
}
