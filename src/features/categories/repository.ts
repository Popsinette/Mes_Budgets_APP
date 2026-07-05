import type { SQLiteDatabase } from 'expo-sqlite';

export type Category = {
  id: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
};

export async function listCategories(db: SQLiteDatabase): Promise<Category[]> {
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY sort_order, name');
}
