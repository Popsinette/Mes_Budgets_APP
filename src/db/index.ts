import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getOrCreateDatabaseKey } from './key';
import { loadBudgetCalendar } from '@/src/features/handover/repository';
import { useSelectedMonth } from '@/src/store/month';
import { currentMonthKey } from '@/src/utils/dates';
import { migrateDatabase } from './schema';

export const DATABASE_NAME = 'mesbudgets.db';

/**
 * Initialisation de la base : déverrouillage SQLCipher (la clé vient du
 * stockage sécurisé du système), puis migrations. `PRAGMA key` doit être
 * la toute première instruction exécutée sur la connexion.
 *
 * Sur le web (PWA), SQLCipher et le Keychain n'existent pas : la base
 * repose sur le stockage privé du navigateur (OPFS), isolé par origine
 * et protégé par le verrouillage de l'appareil.
 */
export async function onDatabaseInit(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS !== 'web') {
    const key = await getOrCreateDatabaseKey();
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await db.execAsync('PRAGMA journal_mode = WAL;');
  }
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrateDatabase(db);
  // Un mois commencé avant le 1er (« Passer à décembre ») devient le mois affiché.
  await loadBudgetCalendar(db);
  useSelectedMonth.setState({ month: currentMonthKey() });
}
