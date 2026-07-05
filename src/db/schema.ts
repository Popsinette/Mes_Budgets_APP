import type { SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 1;

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  date TEXT NOT NULL,             -- 'yyyy-MM-dd'
  month TEXT NOT NULL,            -- 'yyyy-MM' (dénormalisé pour les agrégats)
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,            -- 'yyyy-MM'
  amount_cents INTEGER NOT NULL,
  UNIQUE (category_id, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);

CREATE TABLE IF NOT EXISTS savings_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'flag-outline',
  color TEXT NOT NULL DEFAULT '#6C5CE7',
  target_cents INTEGER NOT NULL,
  monthly_cents INTEGER,          -- versement mensuel prévu (plan d'épargne), optionnel
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS savings_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  date TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_savings_entries_goal ON savings_entries(goal_id);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  month TEXT NOT NULL,            -- 'yyyy-MM'
  paid_at TEXT NOT NULL,
  UNIQUE (bill_id, month)
);
`;

const DEFAULT_CATEGORIES: Array<[string, string, string]> = [
  ['Alimentation', 'cart-outline', '#10B981'],
  ['Logement', 'home-outline', '#6C5CE7'],
  ['Transport', 'car-outline', '#3B82F6'],
  ['Restaurants', 'restaurant-outline', '#F97316'],
  ['Loisirs', 'game-controller-outline', '#EC4899'],
  ['Santé', 'heart-outline', '#EF4444'],
  ['Abonnements', 'tv-outline', '#8B5CF6'],
  ['Vêtements', 'shirt-outline', '#14B8A6'],
  ['Épargne', 'trending-up-outline', '#F59E0B'],
  ['Autre', 'ellipsis-horizontal-outline', '#64748B'],
];

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync(MIGRATION_V1);
    await seedDefaultCategories(db);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

async function seedDefaultCategories(db: SQLiteDatabase): Promise<void> {
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM categories');
  if ((count?.n ?? 0) > 0) return;
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const [name, icon, color] = DEFAULT_CATEGORIES[i];
    await db.runAsync(
      'INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)',
      [name, icon, color, i],
    );
  }
}
