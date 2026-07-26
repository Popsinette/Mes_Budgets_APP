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

// Couleurs issues de `categoryPalette` (src/theme) — palette validée
// contraste/daltonisme sur fond clair et sombre.
const DEFAULT_CATEGORIES: Array<[string, string, string]> = [
  ['Alimentation', 'cart-outline', '#4FA173'],
  ['Logement', 'home-outline', '#837DC1'],
  ['Transport', 'car-outline', '#5E97D1'],
  ['Restaurants', 'restaurant-outline', '#C97558'],
  ['Loisirs', 'game-controller-outline', '#C372A8'],
  ['Santé', 'heart-outline', '#CB778D'],
  ['Abonnements', 'tv-outline', '#9E72BE'],
  ['Vêtements', 'shirt-outline', '#2AA0B0'],
  ['Épargne', 'trending-up-outline', '#B8892F'],
  ['Autre', 'ellipsis-horizontal-outline', '#BD7745'],
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

// V6 : reteinte des catégories et comptes vers la palette sourde (accordée au
// thème « précision tranquille »). On ne touche qu'aux lignes portant encore
// une couleur par défaut historique — les couleurs choisies à la main autres
// que ces hex sont conservées.
const COLOR_REMAP: Array<[string, string]> = [
  ['#10B981', '#5F9070'],
  ['#6C5CE7', '#6E6FA6'],
  ['#3B82F6', '#5580A6'],
  ['#F97316', '#C56A4E'],
  ['#EC4899', '#9A6494'],
  ['#EF4444', '#C57487'],
  ['#8B5CF6', '#7A6E9C'],
  ['#14B8A6', '#3F9195'],
  ['#F59E0B', '#C79A3E'],
  ['#64748B', '#857F76'],
];

// V7 : palette adoucie (validée contraste/daltonisme). Reteinte les couleurs
// par défaut des générations précédentes (sourde V6 et validée vive) vers
// leurs équivalents doux — les couleurs choisies à la main sont conservées.
const COLOR_REMAP_V7: Array<[string, string]> = [
  // génération « sourde » (V6)
  ['#5F9070', '#4FA173'],
  ['#6E6FA6', '#837DC1'],
  ['#5580A6', '#5E97D1'],
  ['#C56A4E', '#C97558'],
  ['#9A6494', '#C372A8'],
  ['#C57487', '#CB778D'],
  ['#7A6E9C', '#9E72BE'],
  ['#3F9195', '#2AA0B0'],
  ['#C79A3E', '#B8892F'],
  ['#857F76', '#BD7745'],
  ['#8B9150', '#89A048'],
  ['#B5695A', '#BD7745'],
  // génération « validée vive »
  ['#C25E3F', '#C97558'],
  ['#0E9BAA', '#2AA0B0'],
  ['#B8841F', '#B8892F'],
  ['#6B65B5', '#837DC1'],
  ['#7E9A3F', '#89A048'],
  ['#B85497', '#C372A8'],
  ['#3F8F63', '#4FA173'],
  ['#4F8FCB', '#5E97D1'],
  ['#B0632F', '#BD7745'],
  ['#8A5FA8', '#9E72BE'],
  ['#5D8A2E', '#789F4C'],
  ['#C05A75', '#CB778D'],
];

// V8 : « budget type » (inspiré du glow-up budget). Chaque catégorie
// appartient à un poste — « besoins », « envies » ou « epargne » — et la
// table budget_templates porte le mois idéal (le modèle que l'on recopie
// dans les mois réels). Les montants sont en centimes, comme partout.
const MIGRATION_V8 = `
ALTER TABLE categories ADD COLUMN bucket TEXT NOT NULL DEFAULT 'envies';
CREATE TABLE IF NOT EXISTS budget_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL
);
`;

// Postes par défaut des catégories connues (les autres restent « envies »).
const BUCKET_DEFAULTS: Array<[string, string]> = [
  ['besoins', 'Alimentation'],
  ['besoins', 'Logement'],
  ['besoins', 'Transport'],
  ['besoins', 'Santé'],
  ['besoins', 'Abonnements'],
  ['epargne', 'Épargne'],
];

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
  if (current < 6) {
    for (const [from, to] of COLOR_REMAP) {
      await db.runAsync('UPDATE categories SET color = ? WHERE color = ?', [to, from]);
      await db.runAsync('UPDATE savings_accounts SET color = ? WHERE color = ?', [to, from]);
    }
    await db.execAsync('PRAGMA user_version = 6');
  }
  if (current < 7) {
    for (const [from, to] of COLOR_REMAP_V7) {
      await db.runAsync('UPDATE categories SET color = ? WHERE color = ?', [to, from]);
      await db.runAsync('UPDATE savings_accounts SET color = ? WHERE color = ?', [to, from]);
    }
    await db.execAsync('PRAGMA user_version = 7');
  }
  if (current < 8) {
    await db.execAsync(MIGRATION_V8);
    for (const [bucket, name] of BUCKET_DEFAULTS) {
      await db.runAsync('UPDATE categories SET bucket = ? WHERE name = ?', [bucket, name]);
    }
    await db.execAsync('PRAGMA user_version = 8');
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
