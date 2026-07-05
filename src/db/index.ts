import type { SQLiteDatabase } from 'expo-sqlite';
import { getOrCreateDatabaseKey } from './key';
import { migrateDatabase } from './schema';

export const DATABASE_NAME = 'mesbudgets.db';

/**
 * Initialisation de la base : déverrouillage SQLCipher (la clé vient du
 * stockage sécurisé du système), puis migrations. `PRAGMA key` doit être
 * la toute première instruction exécutée sur la connexion.
 */
export async function onDatabaseInit(db: SQLiteDatabase): Promise<void> {
  const key = await getOrCreateDatabaseKey();
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrateDatabase(db);
}
