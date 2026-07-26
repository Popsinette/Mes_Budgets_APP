import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';

/** Poste d'une catégorie dans la méthode de budget (50/30/20…). */
export type CategoryBucket = 'besoins' | 'envies' | 'epargne';

export type Category = {
  id: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  bucket: CategoryBucket;
};

export async function listCategories(db: SQLiteDatabase): Promise<Category[]> {
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY sort_order, name');
}

export async function updateCategory(
  db: SQLiteDatabase,
  input: { id: number; name: string; icon: string; color: string; bucket: CategoryBucket },
): Promise<void> {
  await db.runAsync('UPDATE categories SET name = ?, icon = ?, color = ?, bucket = ? WHERE id = ?', [
    input.name,
    input.icon,
    input.color,
    input.bucket,
    input.id,
  ]);
  invalidateQueries();
}

/**
 * Supprime une catégorie : ses budgets sont supprimés (CASCADE), ses
 * transactions et factures passent en « Sans catégorie » (SET NULL).
 */
export async function deleteCategory(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
  invalidateQueries();
}

export async function createCategory(
  db: SQLiteDatabase,
  input: { name: string; icon: string; color: string; bucket?: CategoryBucket },
): Promise<void> {
  const max = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories',
  );
  await db.runAsync(
    'INSERT INTO categories (name, icon, color, sort_order, bucket) VALUES (?, ?, ?, ?, ?)',
    [input.name, input.icon, input.color, (max?.m ?? 0) + 1, input.bucket ?? 'envies'],
  );
  invalidateQueries();
}
