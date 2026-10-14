import type { SQLiteDatabase } from 'expo-sqlite';
import { invalidateQueries } from '@/src/store/invalidation';
import { monthOfWeek, weekKeyOf, weeksOfMonth, type MonthKey, type WeekKey } from '@/src/utils/dates';

/**
 * Enveloppes (méthode Budgetiz), **propres à chaque mois** (V14) :
 * - chaque ligne de `envelopes` appartient à UN mois (`month`) ; aucune
 *   enveloppe n'est partagée entre deux mois ;
 * - « Ma base » (`envelope_templates`) est le modèle copié dans un mois quand
 *   on commence à le remplir (`ensureMonth`). Ensuite le mois vit sa vie :
 *   modifier la base ne touche pas les mois déjà ouverts ;
 * - un mois pas encore ouvert « suit la base » en lecture seule (plan,
 *   prochains mois) : `listEnvelopesForMonth` renvoie alors des enveloppes
 *   virtuelles (`virtual`, id négatif) — à résoudre via `resolveEnvelopeId`
 *   avant toute action.
 *
 * Période « week » : budget variable (Courses, Autres…), montant par semaine,
 * du lundi au dimanche ; une semaine appartient au mois de son jeudi. Période
 * « month » : poste suivi avec les Fixes (Essence, Garderie…), montant par
 * mois civil. `weekly_cents` porte le montant de la période.
 */

export type EnvelopePeriod = 'week' | 'month';

export type Envelope = {
  id: number;
  name: string;
  icon: string;
  color: string;
  weekly_cents: number;
  period: EnvelopePeriod;
  sort_order: number;
  month: MonthKey;
  template_id: number | null;
};

export type EnvelopeTemplate = {
  id: number;
  name: string;
  icon: string;
  color: string;
  amount_cents: number;
  period: EnvelopePeriod;
  sort_order: number;
};

export type EnvelopeWithSpending = Envelope & { spent_cents: number };

export type EnvelopeForMonth = Envelope & {
  /** Mois pas encore ouvert : enveloppe issue de la base, pas encore créée. */
  virtual: boolean;
  /** Budget du mois : montant × nb de semaines (week) ou montant (month). */
  budget_cents: number;
  spent_cents: number;
  /** Semaine en cours (si elle appartient au mois) : dépensé. */
  week_spent_cents: number;
};

export type Expense = {
  id: number;
  envelope_id: number;
  label: string;
  amount_cents: number;
  date: string;
  week: WeekKey;
  envelope_name: string;
  envelope_icon: string;
  envelope_color: string;
  envelope_period: EnvelopePeriod;
  envelope_month: MonthKey;
};

// ---------- Ma base ----------

export async function listTemplates(db: SQLiteDatabase): Promise<EnvelopeTemplate[]> {
  return db.getAllAsync<EnvelopeTemplate>('SELECT * FROM envelope_templates ORDER BY sort_order, id');
}

export async function getTemplate(db: SQLiteDatabase, id: number): Promise<EnvelopeTemplate | null> {
  return db.getFirstAsync<EnvelopeTemplate>('SELECT * FROM envelope_templates WHERE id = ?', [id]);
}

export async function saveTemplate(
  db: SQLiteDatabase,
  input: { id?: number; name: string; icon: string; color: string; amountCents: number; period: EnvelopePeriod },
): Promise<void> {
  if (input.id) {
    await db.runAsync(
      'UPDATE envelope_templates SET name = ?, icon = ?, color = ?, amount_cents = ?, period = ? WHERE id = ?',
      [input.name, input.icon, input.color, input.amountCents, input.period, input.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO envelope_templates (name, icon, color, amount_cents, period, sort_order)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM envelope_templates))`,
      [input.name, input.icon, input.color, input.amountCents, input.period],
    );
  }
  invalidateQueries();
}

export async function deleteTemplate(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM envelope_templates WHERE id = ?', [id]);
  invalidateQueries();
}

/** Base par défaut (installation neuve ou « Tout effacer »). */
export async function seedBase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    INSERT INTO envelope_templates (name, icon, color, amount_cents, period, sort_order) VALUES
      ('Courses', 'cart-outline', '#4FA173', 0, 'week', 0),
      ('Autres', 'bag-handle-outline', '#C97558', 0, 'week', 1);
  `);
}

// ---------- Mois ----------

export async function isMonthReady(db: SQLiteDatabase, month: MonthKey): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM envelope_months_ready WHERE month = ?', [
    month,
  ]);
  return (row?.n ?? 0) > 0;
}

/**
 * Ouvre un mois : copie la base dans ses enveloppes (une seule fois).
 * Renvoie la correspondance ligne de base → enveloppe du mois.
 */
export async function ensureMonth(db: SQLiteDatabase, month: MonthKey): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  let created = false;
  await db.withTransactionAsync(async () => {
    if (!(await isMonthReady(db, month))) {
      for (const t of await listTemplates(db)) {
        const res = await db.runAsync(
          `INSERT INTO envelopes (name, icon, color, weekly_cents, period, sort_order, created_at, month, template_id)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
          [t.name, t.icon, t.color, t.amount_cents, t.period, t.sort_order, month, t.id],
        );
        map.set(t.id, Number(res.lastInsertRowId));
      }
      await db.runAsync('INSERT INTO envelope_months_ready (month) VALUES (?)', [month]);
      created = true;
    } else {
      const rows = await db.getAllAsync<{ id: number; template_id: number | null }>(
        'SELECT id, template_id FROM envelopes WHERE month = ? AND template_id IS NOT NULL',
        [month],
      );
      for (const r of rows) if (r.template_id) map.set(r.template_id, r.id);
    }
  });
  if (created) invalidateQueries();
  return map;
}

/** Id réel d'une enveloppe affichée (ouvre son mois si elle venait de la base). */
export async function resolveEnvelopeId(db: SQLiteDatabase, envelope: EnvelopeForMonth): Promise<number | null> {
  if (!envelope.virtual) return envelope.id;
  const map = await ensureMonth(db, envelope.month);
  return envelope.template_id ? (map.get(envelope.template_id) ?? null) : null;
}

/** Remet un mois sur la base : ses enveloppes sans dépense sont remplacées par celles de la base. */
export async function resetMonthFromBase(db: SQLiteDatabase, month: MonthKey): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM envelopes WHERE month = ? AND NOT EXISTS (SELECT 1 FROM expenses x WHERE x.envelope_id = envelopes.id)',
      [month],
    );
    const kept = await db.getAllAsync<{ template_id: number | null }>(
      'SELECT template_id FROM envelopes WHERE month = ?',
      [month],
    );
    const keptTemplates = new Set(kept.map((k) => k.template_id));
    for (const t of await listTemplates(db)) {
      if (keptTemplates.has(t.id)) continue;
      await db.runAsync(
        `INSERT INTO envelopes (name, icon, color, weekly_cents, period, sort_order, created_at, month, template_id)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
        [t.name, t.icon, t.color, t.amount_cents, t.period, t.sort_order, month, t.id],
      );
    }
    await db.runAsync('INSERT OR IGNORE INTO envelope_months_ready (month) VALUES (?)', [month]);
  });
  invalidateQueries();
}

// ---------- Enveloppes d'un mois ----------

export async function getEnvelope(db: SQLiteDatabase, id: number): Promise<Envelope | null> {
  return db.getFirstAsync<Envelope>('SELECT * FROM envelopes WHERE id = ?', [id]);
}

/**
 * Enveloppes d'un mois avec leur budget et leurs dépenses. Un mois pas encore
 * ouvert renvoie les enveloppes de la base (virtuelles, sans dépense).
 */
export async function listEnvelopesForMonth(
  db: SQLiteDatabase,
  month: MonthKey,
  currentWeek: WeekKey,
): Promise<EnvelopeForMonth[]> {
  const weeks = weeksOfMonth(month);
  const budgetOf = (period: EnvelopePeriod, amount: number) => (period === 'week' ? amount * weeks.length : amount);

  if (!(await isMonthReady(db, month))) {
    const templates = await listTemplates(db);
    return templates.map((t) => ({
      id: -t.id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      weekly_cents: t.amount_cents,
      period: t.period,
      sort_order: t.sort_order,
      month,
      template_id: t.id,
      virtual: true,
      budget_cents: budgetOf(t.period, t.amount_cents),
      spent_cents: 0,
      week_spent_cents: 0,
    }));
  }

  const rows = await db.getAllAsync<Envelope & { spent_cents: number; week_spent_cents: number }>(
    `SELECT e.*,
       COALESCE((SELECT SUM(amount_cents) FROM expenses x WHERE x.envelope_id = e.id), 0) AS spent_cents,
       COALESCE((SELECT SUM(amount_cents) FROM expenses x WHERE x.envelope_id = e.id AND x.week = ?), 0) AS week_spent_cents
     FROM envelopes e
     WHERE e.month = ?
     ORDER BY e.sort_order, e.id`,
    [currentWeek, month],
  );
  return rows.map((e) => ({ ...e, virtual: false, budget_cents: budgetOf(e.period, e.weekly_cents) }));
}

/** Enveloppes hebdomadaires d'une semaine (celles du mois de la semaine) et leur dépensé. */
export async function listEnvelopesForWeek(db: SQLiteDatabase, week: WeekKey): Promise<EnvelopeWithSpending[]> {
  const list = await listEnvelopesForMonth(db, monthOfWeek(week), week);
  return list
    .filter((e) => e.period === 'week')
    .map(({ virtual: _v, budget_cents: _b, spent_cents: _s, week_spent_cents, ...e }) => ({
      ...e,
      spent_cents: week_spent_cents,
    }));
}

/**
 * Crée ou modifie une enveloppe d'un mois. Créer dans un mois pas encore
 * ouvert l'ouvre d'abord (copie de la base), puis ajoute l'enveloppe.
 */
export async function saveEnvelope(
  db: SQLiteDatabase,
  input: {
    id?: number;
    month: MonthKey;
    name: string;
    icon: string;
    color: string;
    amountCents: number;
    period: EnvelopePeriod;
  },
): Promise<void> {
  if (input.id) {
    await db.runAsync('UPDATE envelopes SET name = ?, icon = ?, color = ?, weekly_cents = ?, period = ? WHERE id = ?', [
      input.name,
      input.icon,
      input.color,
      input.amountCents,
      input.period,
      input.id,
    ]);
  } else {
    await ensureMonth(db, input.month);
    await db.runAsync(
      `INSERT INTO envelopes (name, icon, color, weekly_cents, period, sort_order, created_at, month)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM envelopes WHERE month = ?), datetime('now'), ?)`,
      [input.name, input.icon, input.color, input.amountCents, input.period, input.month, input.month],
    );
  }
  invalidateQueries();
}

/** Supprime l'enveloppe de son mois (et ses dépenses). Les autres mois ne changent pas. */
export async function deleteEnvelope(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM envelopes WHERE id = ?', [id]);
  invalidateQueries();
}

// ---------- Dépenses ----------

const EXPENSE_SELECT = `
  SELECT x.*, e.name AS envelope_name, e.icon AS envelope_icon, e.color AS envelope_color,
    e.period AS envelope_period, e.month AS envelope_month
  FROM expenses x JOIN envelopes e ON e.id = x.envelope_id`;

/** Dépenses du mois, d'une période d'enveloppe donnée (Variables = week, postes des Fixes = month). */
export async function listExpensesForMonth(
  db: SQLiteDatabase,
  month: MonthKey,
  period: EnvelopePeriod,
): Promise<Expense[]> {
  return db.getAllAsync<Expense>(
    `${EXPENSE_SELECT} WHERE e.period = ? AND e.month = ? ORDER BY x.date DESC, x.id DESC`,
    [period, month],
  );
}

export async function listExpensesForEnvelope(db: SQLiteDatabase, envelopeId: number): Promise<Expense[]> {
  return db.getAllAsync<Expense>(`${EXPENSE_SELECT} WHERE x.envelope_id = ? ORDER BY x.date DESC, x.id DESC`, [
    envelopeId,
  ]);
}

export async function getExpense(db: SQLiteDatabase, id: number): Promise<Expense | null> {
  return db.getFirstAsync<Expense>(`${EXPENSE_SELECT} WHERE x.id = ?`, [id]);
}

export async function saveExpense(
  db: SQLiteDatabase,
  input: { id?: number; envelopeId: number; label: string; amountCents: number; date: string },
): Promise<void> {
  const week = weekKeyOf(input.date);
  if (input.id) {
    await db.runAsync(
      'UPDATE expenses SET envelope_id = ?, label = ?, amount_cents = ?, date = ?, week = ? WHERE id = ?',
      [input.envelopeId, input.label, input.amountCents, input.date, week, input.id],
    );
  } else {
    await db.runAsync(
      "INSERT INTO expenses (envelope_id, label, amount_cents, date, week, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
      [input.envelopeId, input.label, input.amountCents, input.date, week],
    );
  }
  invalidateQueries();
}

export async function deleteExpense(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  invalidateQueries();
}

// ---------- Fin de semaine ----------

export async function isWeekClosed(db: SQLiteDatabase, week: WeekKey): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM week_closures WHERE week = ?', [week]);
  return (row?.n ?? 0) > 0;
}

/**
 * Solde une semaine terminée : son reste est mis de côté dans une poche
 * (si `potId`) ou volontairement laissé. La carte « fin de semaine » disparaît.
 */
export async function closeWeek(
  db: SQLiteDatabase,
  input: { week: WeekKey; potId?: number; amountCents?: number; date: string },
): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (input.potId && input.amountCents && input.amountCents > 0) {
      await db.runAsync(
        "INSERT INTO savings_moves (pot_id, amount_cents, date, note, week, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        [input.potId, input.amountCents, input.date, 'Reste de la semaine', input.week],
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO week_closures (week, closed_at) VALUES (?, datetime('now'))",
      [input.week],
    );
  });
  invalidateQueries();
}
