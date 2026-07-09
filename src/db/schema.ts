import type { SQLiteDatabase } from 'expo-sqlite';


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

// V2 : le pointage d'une facture crée la dépense correspondante ; on garde
// le lien pour pouvoir la retirer si on dé-pointe la facture.
const MIGRATION_V2 = `
ALTER TABLE bill_payments ADD COLUMN transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;
`;

// V3 : les dépenses issues du pointage d'une facture portent bill_id, pour
// être exclues du suivi des budgets (qui ne concernent que les dépenses libres).
const MIGRATION_V3 = `
ALTER TABLE transactions ADD COLUMN bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL;
UPDATE transactions SET bill_id = (
  SELECT bp.bill_id FROM bill_payments bp WHERE bp.transaction_id = transactions.id
)
WHERE id IN (SELECT transaction_id FROM bill_payments WHERE transaction_id IS NOT NULL);
`;

// V4 : l'épargne passe d'« objectifs » à de vrais « comptes » (Livret A, LDDS…)
// avec une valeur de départ (épargne déjà cumulée), et les versements deviennent
// des virements datés, rattachés à un compte, marquables « effectués » (coche).
const MIGRATION_V4 = `
CREATE TABLE savings_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'wallet-outline',
  color TEXT NOT NULL DEFAULT '#6C5CE7',
  initial_cents INTEGER NOT NULL DEFAULT 0,   -- valeur de départ (épargne déjà cumulée)
  target_cents INTEGER,                       -- objectif optionnel
  monthly_cents INTEGER,                      -- virement mensuel prévu (prévisionnel)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

INSERT INTO savings_accounts (id, name, icon, color, initial_cents, target_cents, monthly_cents, sort_order, created_at)
  SELECT id, name, icon, color, 0, target_cents, monthly_cents, id, created_at FROM savings_goals;

CREATE TABLE savings_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  month TEXT NOT NULL,       -- 'yyyy-MM'
  date TEXT NOT NULL,        -- 'yyyy-MM-dd'
  done INTEGER NOT NULL DEFAULT 1,   -- 0 = prévu, 1 = effectué (coché)
  note TEXT
);
CREATE INDEX idx_savings_transfers_account ON savings_transfers(account_id);
CREATE INDEX idx_savings_transfers_month ON savings_transfers(month);

INSERT INTO savings_transfers (account_id, amount_cents, month, date, done, note)
  SELECT goal_id, amount_cents, substr(date, 1, 7), date, 1, note FROM savings_entries;

DROP TABLE savings_entries;
DROP TABLE savings_goals;
`;

// V5 : pointage des opérations. `cleared` = 0 (à venir / en attente sur le
// compte) ou 1 (passée / pointée). On saisit une dépense dès qu'on la fait,
// puis on la pointe quand elle apparaît sur le relevé. Le solde « réel » ne
// compte que les opérations pointées ; le « prévisionnel » compte tout.
// Défaut 1 : l'historique et les dépenses de factures (déjà réglées) comptent
// comme passées.
const MIGRATION_V5 = `
ALTER TABLE transactions ADD COLUMN cleared INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_transactions_cleared ON transactions(cleared);
`;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync(MIGRATION_V1);
    await seedDefaultCategories(db);
    await db.execAsync('PRAGMA user_version = 1');
  }
  if (current < 2) {
    await db.execAsync(MIGRATION_V2);
    await db.execAsync('PRAGMA user_version = 2');
  }
  if (current < 3) {
    await db.execAsync(MIGRATION_V3);
    await db.execAsync('PRAGMA user_version = 3');
  }
  if (current < 4) {
    await db.execAsync(MIGRATION_V4);
    await db.execAsync('PRAGMA user_version = 4');
  }
  if (current < 5) {
    await db.execAsync(MIGRATION_V5);
    await db.execAsync('PRAGMA user_version = 5');
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
