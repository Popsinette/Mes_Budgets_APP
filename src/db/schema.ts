import type { SQLiteDatabase } from 'expo-sqlite';
import { categoryPalette, LEGACY_PALETTE } from '@/src/theme/palette';
import { currentMonthKey, monthOfWeek } from '@/src/utils/dates';
import { migrateLegacyToV9 } from './legacy';

/**
 * Modèle « Budgetiz » (V10), volontairement simple. Trois axes indépendants,
 * aucun lien croisé à maintenir :
 *
 * 1. `fixed_items` + `fixed_checks` — revenus et charges fixes planifiés
 *    (mensuels, trimestriels, annuels ou ponctuels), cochés « reçu / prélevé »
 *    mois par mois.
 * 2. `envelopes` + `expenses` — budget variable en enveloppes **hebdomadaires**
 *    (Courses, Autres…) ; chaque dépense est rangée dans la semaine de son
 *    lundi (`week`), et une semaine appartient au mois de son jeudi (cf. `monthOfWeek`).
 * 3. `savings_pots` + `savings_moves` — poches d'épargne (« Urgence & avenir »,
 *    « Projets & pépins »…) ; solde = valeur de départ + Σ mouvements.
 *
 * Montants en centimes partout. Pour changer le schéma : ajouter une
 * migration `current < N`, ne jamais modifier `SCHEMA_V10` ni les migrations déjà livrées.
 */
const SCHEMA_V10 = `
CREATE TABLE envelopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  weekly_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  date TEXT NOT NULL,             -- 'yyyy-MM-dd'
  week TEXT NOT NULL              -- lundi de la semaine, 'yyyy-MM-dd' (dénormalisé)
);
CREATE INDEX idx_expenses_week ON expenses(week);

CREATE TABLE fixed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'charge')),
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly', 'once')),
  start_month TEXT NOT NULL,      -- 'yyyy-MM' : premier mois concerné
  end_month TEXT,                 -- dernier mois concerné (NULL = toujours)
  created_at TEXT NOT NULL
);

CREATE TABLE fixed_checks (
  item_id INTEGER NOT NULL REFERENCES fixed_items(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (item_id, month)
);

CREATE TABLE savings_pots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('securite', 'projet')),
  initial_cents INTEGER NOT NULL DEFAULT 0,
  target_cents INTEGER,
  monthly_cents INTEGER,          -- versement mensuel programmé (optionnel)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE savings_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pot_id INTEGER NOT NULL REFERENCES savings_pots(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,  -- > 0 dépôt, < 0 retrait
  date TEXT NOT NULL,
  note TEXT,
  plan_month TEXT,                -- versement programmé de ce mois (coche)
  week TEXT                       -- reste de cette semaine mis de côté
);
CREATE INDEX idx_savings_moves_pot ON savings_moves(pot_id);
CREATE UNIQUE INDEX idx_savings_moves_plan ON savings_moves(pot_id, plan_month) WHERE plan_month IS NOT NULL;

-- Semaines « soldées » : le reste a été mis de côté ou volontairement laissé.
CREATE TABLE week_closures (
  week TEXT PRIMARY KEY,
  closed_at TEXT NOT NULL
);
`;

/**
 * V11 — écrans façon Budgetiz :
 * - `envelopes.period` : 'week' (Variables : Courses, Autres…, montant par
 *   semaine) ou 'month' (postes suivis avec les Fixes : Essence, Garderie,
 *   Cantine…, montant par mois). `weekly_cents` porte le montant de la période.
 * - `fixed_items.icon` : pastille de la ligne (optionnelle).
 * - `savings_pots.deadline` : date limite d'une cagnotte ('yyyy-MM-dd').
 * - `health_expenses` : frais de santé avancés et leur remboursement attendu ;
 *   `settled` = remboursement reçu (« Terminé »).
 */
const MIGRATION_V11 = `
ALTER TABLE envelopes ADD COLUMN period TEXT NOT NULL DEFAULT 'week';
ALTER TABLE fixed_items ADD COLUMN icon TEXT;
ALTER TABLE savings_pots ADD COLUMN deadline TEXT;
CREATE TABLE health_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  refund_cents INTEGER NOT NULL DEFAULT 0,
  settled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_health_date ON health_expenses(date);
`;

/**
 * V12 — « Mon compte » (un seul compte courant) :
 * - `account` (une ligne, id = 1) : solde saisi depuis la banque et l'instant
 *   de la saisie (`start_at`, horodatage SQLite UTC) ;
 * - horodatage d'enregistrement (`created_at`) des dépenses, frais de santé et
 *   mouvements d'épargne, et `settled_at` du remboursement santé. Le solde
 *   estimé ne compte que ce qui est noté / coché APRÈS la saisie du solde
 *   (le solde bancaire inclut déjà le reste). Lignes existantes : NULL = avant.
 */
const MIGRATION_V12 = `
CREATE TABLE account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  start_cents INTEGER NOT NULL,
  start_at TEXT NOT NULL
);
ALTER TABLE expenses ADD COLUMN created_at TEXT;
ALTER TABLE health_expenses ADD COLUMN created_at TEXT;
ALTER TABLE health_expenses ADD COLUMN settled_at TEXT;
ALTER TABLE savings_moves ADD COLUMN created_at TEXT;
`;

/**
 * V13 — enveloppes propres à chaque mois :
 * - `envelopes.start_month` / `end_month` : mois de validité (NULL = sans
 *   limite). Une enveloppe ponctuelle (« Anniversaire » en novembre) a
 *   start = end = ce mois. Arrêter une enveloppe récurrente = poser end_month.
 * - `envelope_months` : montant propre à un mois (remplace `weekly_cents` pour
 *   ce mois-là seulement).
 */
const MIGRATION_V13 = `
ALTER TABLE envelopes ADD COLUMN start_month TEXT;
ALTER TABLE envelopes ADD COLUMN end_month TEXT;
CREATE TABLE envelope_months (
  envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  PRIMARY KEY (envelope_id, month)
);
`;

const DEFAULT_ENVELOPES = `
INSERT INTO envelopes (name, icon, color, weekly_cents, sort_order, created_at) VALUES
  ('Courses', 'cart-outline', '#4FA173', 0, 0, datetime('now')),
  ('Autres', 'bag-handle-outline', '#C97558', 0, 1, datetime('now'));
`;

const DEFAULT_POTS = `
INSERT INTO savings_pots (name, icon, color, kind, sort_order, created_at) VALUES
  ('Urgence & avenir', 'shield-checkmark-outline', '#5E97D1', 'securite', 0, datetime('now')),
  ('Projets & pépins', 'airplane-outline', '#B8892F', 'projet', 1, datetime('now'));
`;

/** Lundi de la semaine d'une date ISO, en SQL. */
const MONDAY_OF = (col: string) =>
  `date(${col}, '-' || ((CAST(strftime('%w', ${col}) AS INTEGER) + 6) % 7) || ' days')`;

/**
 * Conversion de l'ancien modèle (V9) vers V10 :
 * - budgets par catégorie → deux enveloppes hebdomadaires (Courses = budget
 *   « Alimentation », Autres = le reste), montants mensuels × 12 / 52 ;
 * - dépenses libres → dépenses d'enveloppe ; les dépenses de factures
 *   disparaissent (une charge fixe cochée suffit) ;
 * - revenus → revenus ponctuels du mois, cochés « reçus » s'ils étaient pointés ;
 * - factures → charges fixes mensuelles, avec leurs coches ;
 * - comptes d'épargne → poches, virements effectués → mouvements.
 */
const CONVERT_V9 = `
CREATE TEMP TABLE _courses_cats AS
  SELECT id FROM categories WHERE lower(name) IN ('alimentation', 'courses', 'supermarché', 'nourriture');

INSERT INTO envelopes (name, icon, color, weekly_cents, sort_order, created_at)
  SELECT 'Courses', 'cart-outline', '#4FA173',
    CAST(ROUND(COALESCE((SELECT SUM(amount_cents) FROM budgets
      WHERE month = (SELECT MAX(month) FROM budgets)
        AND category_id IN (SELECT id FROM _courses_cats)), 0) * 12.0 / 52) AS INTEGER),
    0, datetime('now');
INSERT INTO envelopes (name, icon, color, weekly_cents, sort_order, created_at)
  SELECT 'Autres', 'bag-handle-outline', '#C97558',
    CAST(ROUND(COALESCE((SELECT SUM(amount_cents) FROM budgets
      WHERE month = (SELECT MAX(month) FROM budgets)
        AND category_id NOT IN (SELECT id FROM _courses_cats)), 0) * 12.0 / 52) AS INTEGER),
    1, datetime('now');

INSERT INTO expenses (envelope_id, label, amount_cents, date, week)
  SELECT
    CASE WHEN t.category_id IN (SELECT id FROM _courses_cats)
      THEN (SELECT id FROM envelopes WHERE name = 'Courses')
      ELSE (SELECT id FROM envelopes WHERE name = 'Autres') END,
    t.label, t.amount_cents, t.date, ${MONDAY_OF('t.date')}
  FROM transactions t
  WHERE t.type = 'expense' AND t.bill_id IS NULL
  ORDER BY t.date, t.id;

INSERT INTO fixed_items (kind, name, amount_cents, day, frequency, start_month, end_month, created_at)
  SELECT 'income', label, amount_cents, CAST(substr(date, 9, 2) AS INTEGER), 'once', month, month,
    'legacy-income:' || id
  FROM transactions WHERE type = 'income';
INSERT INTO fixed_checks (item_id, month, checked_at)
  SELECT f.id, f.start_month, datetime('now')
  FROM fixed_items f JOIN transactions t ON f.created_at = 'legacy-income:' || t.id
  WHERE t.cleared = 1;

INSERT INTO fixed_items (kind, name, amount_cents, day, frequency, start_month, end_month, created_at)
  SELECT 'charge', b.name, b.amount_cents, b.due_day, 'monthly',
    MIN(substr(b.created_at, 1, 7), COALESCE((SELECT MIN(month) FROM bill_payments WHERE bill_id = b.id), '9999')),
    CASE WHEN b.active = 1 THEN NULL
      ELSE COALESCE((SELECT MAX(month) FROM bill_payments WHERE bill_id = b.id), substr(b.created_at, 1, 7)) END,
    'legacy-bill:' || b.id
  FROM bills b;
INSERT INTO fixed_checks (item_id, month, checked_at)
  SELECT f.id, bp.month, bp.paid_at
  FROM bill_payments bp JOIN fixed_items f ON f.created_at = 'legacy-bill:' || bp.bill_id;

UPDATE fixed_items SET created_at = datetime('now') WHERE created_at LIKE 'legacy-%';

INSERT INTO savings_pots (id, name, icon, color, kind, initial_cents, target_cents, monthly_cents, sort_order, created_at)
  SELECT id, name, icon, color,
    CASE WHEN lower(name) LIKE '%livret a%' OR lower(name) LIKE '%ldds%' OR lower(name) LIKE '%urgence%'
      OR lower(name) LIKE '%précaution%' OR lower(name) LIKE '%securite%' OR lower(name) LIKE '%sécurité%'
      THEN 'securite' ELSE 'projet' END,
    initial_cents, target_cents, monthly_cents, sort_order, created_at
  FROM savings_accounts;
INSERT INTO savings_moves (pot_id, amount_cents, date, note)
  SELECT account_id, amount_cents, date, note FROM savings_transfers WHERE done = 1;

DROP TABLE _courses_cats;
DROP TABLE bill_payments;
DROP TABLE budget_templates;
DROP TABLE budgets;
DROP TABLE transactions;
DROP TABLE bills;
DROP TABLE categories;
DROP TABLE savings_transfers;
DROP TABLE savings_accounts;
`;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current === 0) {
    // Installation neuve : directement le modèle simplifié.
    await db.withTransactionAsync(async () => {
      await db.execAsync(SCHEMA_V10);
      await seedDefaults(db);
    });
    await db.execAsync('PRAGMA user_version = 10');
  } else if (current < 10) {
    // Base existante : on termine l'ancienne chaîne, puis on convertit en une
    // seule transaction (tout ou rien — l'ancienne base reste intacte en cas d'échec).
    await migrateLegacyToV9(db, current);
    await db.withTransactionAsync(async () => {
      await db.execAsync(SCHEMA_V10);
      await db.execAsync(CONVERT_V9);
    });
    await db.execAsync('PRAGMA user_version = 10');
  }

  if (current < 11) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V11);
    });
    await db.execAsync('PRAGMA user_version = 11');
  }

  if (current < 12) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V12);
    });
    await db.execAsync('PRAGMA user_version = 12');
  }

  if (current < 13) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V13);
    });
    await db.execAsync('PRAGMA user_version = 13');
  }

  if (current < 14) {
    await db.withTransactionAsync(async () => {
      await migrateToMonthlyEnvelopes(db);
    });
    await db.execAsync('PRAGMA user_version = 14');
  }

  if (current < 15) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V15);
    });
    await db.execAsync('PRAGMA user_version = 15');
  }

  if (current < 16) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V16);
    });
    await db.execAsync('PRAGMA user_version = 16');
  }

  if (current < 17) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V17);
    });
    await db.execAsync('PRAGMA user_version = 17');
  }

  if (current < 18) {
    await db.withTransactionAsync(async () => {
      await upgradeLegacyColors(db);
    });
    await db.execAsync('PRAGMA user_version = 18');
  }
}

/**
 * V18 — nouvelle palette pastel : chaque couleur de l'ancienne palette
 * (teintes sourdes, brunes) devient la teinte de même rang de la nouvelle,
 * pour les enveloppes, la base et les cagnottes. Aussi appelée après les
 * données d'exemple de « Tout effacer » (elles reprennent l'ancienne palette).
 */
export async function upgradeLegacyColors(db: SQLiteDatabase): Promise<void> {
  const cases = LEGACY_PALETTE.map(
    (old, i) => `WHEN '${old}' THEN '${categoryPalette[i % categoryPalette.length]}'`,
  ).join(' ');
  for (const table of ['envelopes', 'envelope_templates', 'savings_pots']) {
    await db.execAsync(`UPDATE ${table} SET color = CASE upper(color) ${cases} ELSE color END`);
  }
}

/**
 * V17 — pointage des dépenses : `expenses.cleared_at` = moment où la dépense
 * a été pointée (débitée sur le compte), NULL = « à pointer ». Les dépenses
 * déjà notées sont considérées pointées au moment de leur saisie : le solde
 * du compte ne bouge pas à la mise à jour.
 */
const MIGRATION_V17 = `
ALTER TABLE expenses ADD COLUMN cleared_at TEXT;
UPDATE expenses SET cleared_at = COALESCE(created_at, '1970-01-01 00:00:00');
`;

/**
 * V16 — sauvegarde & clôture du mois.
 * - `app_meta` : petites valeurs de l'app (date de la dernière sauvegarde,
 *   mois clôturés). Jamais exportée.
 * - `envelopes.adjust_cents` : ajustement du budget du mois (signé) posé par
 *   la clôture — reste mis de côté ou reporté (−), dépassement reporté ou
 *   couvert (+), report reçu du mois précédent (±).
 * - `month_closures` : la décision de clôture de chaque enveloppe (pour
 *   l'afficher et pouvoir l'annuler).
 */
const MIGRATION_V16 = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
ALTER TABLE envelopes ADD COLUMN adjust_cents INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS month_closures (
  envelope_id INTEGER PRIMARY KEY REFERENCES envelopes(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('save', 'carry', 'cover')),
  amount_cents INTEGER NOT NULL,
  move_id INTEGER REFERENCES savings_moves(id) ON DELETE SET NULL,
  target_envelope_id INTEGER REFERENCES envelopes(id) ON DELETE SET NULL,
  closed_at TEXT NOT NULL
);
`;

/**
 * V15 — « Pas ce mois-ci » : une cagnotte peut sauter son versement programmé
 * pour un mois donné (le montant mensuel reste le même pour les autres mois).
 */
const MIGRATION_V15 = `
CREATE TABLE IF NOT EXISTS savings_skips (
  pot_id INTEGER NOT NULL REFERENCES savings_pots(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  PRIMARY KEY (pot_id, month)
);
`;

/**
 * V14 — chaque mois a SES enveloppes, sans lien avec les autres mois.
 * - `envelope_templates` = « Ma base » : le modèle copié dans un mois quand on
 *   commence à le remplir (`ensureMonth`).
 * - `envelopes.month` : le mois de l'enveloppe ; `template_id` : la ligne de
 *   base dont elle est issue (simple trace, aucun lien de calcul).
 * - `envelope_months_ready` : mois déjà « ouverts » (leurs enveloppes existent
 *   et sont indépendantes). Un mois non ouvert suit la base, en lecture seule.
 * Conversion : la base reprend les enveloppes récurrentes encore actives ; chaque
 * mois portant des dépenses, un montant propre ou une enveloppe ponctuelle (et le
 * mois courant) reçoit sa copie des enveloppes
 * actives ce mois-là avec son montant (propre au mois sinon habituel), et ses
 * dépenses y sont rattachées. Les anciennes lignes et `envelope_months` disparaissent.
 */
async function migrateToMonthlyEnvelopes(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE envelopes ADD COLUMN month TEXT;
    ALTER TABLE envelopes ADD COLUMN template_id INTEGER;
    CREATE INDEX idx_envelopes_month ON envelopes(month);
    CREATE TABLE envelope_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      period TEXT NOT NULL DEFAULT 'week',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE envelope_months_ready (month TEXT PRIMARY KEY);
  `);

  type Old = {
    id: number;
    name: string;
    icon: string;
    color: string;
    weekly_cents: number;
    period: string;
    sort_order: number;
    start_month: string | null;
    end_month: string | null;
  };
  const olds = await db.getAllAsync<Old>('SELECT * FROM envelopes ORDER BY sort_order, id');
  const now = currentMonthKey();
  const active = (o: Old, m: string) => (!o.start_month || o.start_month <= m) && (!o.end_month || o.end_month >= m);
  const oneOff = (o: Old) => Boolean(o.start_month && o.start_month === o.end_month);

  const templateOf = new Map<number, number>();
  for (const o of olds) {
    if (oneOff(o) || (o.end_month && o.end_month < now)) continue;
    const res = await db.runAsync(
      'INSERT INTO envelope_templates (name, icon, color, amount_cents, period, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [o.name, o.icon, o.color, o.weekly_cents, o.period, o.sort_order],
    );
    templateOf.set(o.id, Number(res.lastInsertRowId));
  }

  const expenses = await db.getAllAsync<{ id: number; envelope_id: number; date: string; week: string; period: string }>(
    'SELECT x.id, x.envelope_id, x.date, x.week, e.period FROM expenses x JOIN envelopes e ON e.id = x.envelope_id',
  );
  const monthOfExpense = (x: { date: string; week: string; period: string }) =>
    x.period === 'week' ? monthOfWeek(x.week) : x.date.slice(0, 7);
  const byKey = new Map<string, number[]>(); // `${envelope}|${mois}` → dépenses
  const months = new Set<string>([now]);
  for (const x of expenses) {
    const m = monthOfExpense(x);
    months.add(m);
    const key = `${x.envelope_id}|${m}`;
    byKey.set(key, [...(byKey.get(key) ?? []), x.id]);
  }
  const overrides = await db.getAllAsync<{ envelope_id: number; month: string; amount_cents: number }>(
    'SELECT * FROM envelope_months',
  );
  // Un mois préparé à l'avance (montant propre, enveloppe ponctuelle) garde ses réglages.
  for (const r of overrides) months.add(r.month);
  for (const o of olds) if (oneOff(o) && o.start_month) months.add(o.start_month);

  for (const m of [...months].sort()) {
    for (const o of olds) {
      const ids = byKey.get(`${o.id}|${m}`) ?? [];
      if (!active(o, m) && ids.length === 0) continue;
      const amount = overrides.find((r) => r.envelope_id === o.id && r.month === m)?.amount_cents ?? o.weekly_cents;
      const res = await db.runAsync(
        `INSERT INTO envelopes (name, icon, color, weekly_cents, period, sort_order, created_at, month, template_id)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
        [o.name, o.icon, o.color, amount, o.period, o.sort_order, m, templateOf.get(o.id) ?? null],
      );
      const newId = Number(res.lastInsertRowId);
      for (const id of ids) await db.runAsync('UPDATE expenses SET envelope_id = ? WHERE id = ?', [newId, id]);
    }
    await db.runAsync('INSERT OR IGNORE INTO envelope_months_ready (month) VALUES (?)', [m]);
  }

  await db.execAsync(`
    DELETE FROM envelopes WHERE month IS NULL;
    DROP TABLE envelope_months;
  `);
}

/** Enveloppes Courses / Autres (deviennent « Ma base » en V14) et les deux poches d'épargne. */
export async function seedDefaults(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(DEFAULT_ENVELOPES);
  await db.execAsync(DEFAULT_POTS);
}

/** Les deux poches d'épargne de la méthode (utilisé par « Tout effacer »). */
export async function seedPots(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(DEFAULT_POTS);
}
