import type { SQLiteDatabase } from 'expo-sqlite';
import { getMeta, setMeta } from '@/src/features/backup/repository';
import {
  ensureMonth,
  isMonthReady,
  listEnvelopesForMonth,
  undoClosureRow,
  type ClosureRow,
  type EnvelopeForMonth,
} from '@/src/features/envelopes/repository';
import { invalidateQueries } from '@/src/store/invalidation';
import { currentMonthKey, monthKeyLabel, shiftMonthKey, weeksOfMonth, type MonthKey } from '@/src/utils/dates';

/**
 * Clôture du mois : pour chaque enveloppe, que faire de son reste (ou de son
 * dépassement) une fois le mois fini.
 *
 * - `save`  : reste mis de côté dans une cagnotte (virement d'épargne) ;
 * - `cover` : dépassement couvert par une cagnotte (retrait) ;
 * - `carry` : reste ou dépassement reporté sur l'enveloppe du même nom le
 *   mois suivant (elle est créée, à 0 €, si elle n'existe pas).
 *
 * Mécanique unique : la clôture ajuste le budget de l'enveloppe
 * (`adjust_cents`) pour qu'il tombe pile sur ce qui a été dépensé — le reste
 * sort du mois (−), le dépassement y est absorbé (+) — et un report ajoute
 * l'inverse au budget de l'enveloppe du mois suivant. Le plan, la pastille et
 * le compte restent donc cohérents sans règle particulière.
 */

export type ClosureAction = ClosureRow['action'];

export type ClosureLine = EnvelopeForMonth & {
  /** À clôturer : reste (+) ou dépassement (−), restes de semaines déjà mis de côté déduits. */
  remainder_cents: number;
  closure: (ClosureRow & { pot_name: string | null; target_month: MonthKey | null }) | null;
};

export type MonthClosure = {
  month: MonthKey;
  ready: boolean;
  lines: ClosureLine[];
  /** Restes de semaines déjà mis de côté pendant le mois (Variables). */
  weeks_saved_cents: number;
  /** Marqué « terminé » par l'utilisateur. */
  done: boolean;
  /** Enveloppes avec un reste ou un dépassement pas encore traité. */
  pending: number;
};

const doneKey = (month: MonthKey) => `closure_done:${month}`;

export async function getMonthClosure(db: SQLiteDatabase, month: MonthKey): Promise<MonthClosure> {
  const ready = await isMonthReady(db, month);
  if (!ready) return { month, ready, lines: [], weeks_saved_cents: 0, done: false, pending: 0 };
  const weeks = weeksOfMonth(month);
  const [envelopes, closures, saved, done] = await Promise.all([
    listEnvelopesForMonth(db, month, '2000-01-03'),
    db.getAllAsync<ClosureRow & { pot_name: string | null; target_month: MonthKey | null }>(
      `SELECT c.*, p.name AS pot_name, t.month AS target_month
       FROM month_closures c
       JOIN envelopes e ON e.id = c.envelope_id
       LEFT JOIN savings_moves m ON m.id = c.move_id
       LEFT JOIN savings_pots p ON p.id = m.pot_id
       LEFT JOIN envelopes t ON t.id = c.target_envelope_id
       WHERE e.month = ?`,
      [month],
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM savings_moves WHERE week IN (${weeks.map(() => '?').join(', ')})`,
      weeks,
    ),
    getMeta(db, doneKey(month)),
  ]);
  const byEnvelope = new Map(closures.map((c) => [c.envelope_id, c]));
  // Les restes de semaines mis de côté (toutes enveloppes variables confondues)
  // sont imputés aux enveloppes variables dans l'ordre d'affichage.
  let weeksLeft = Math.max(0, saved?.total ?? 0);
  const lines = envelopes.map((e) => {
    let remainder = e.budget_cents - e.spent_cents;
    if (e.period === 'week' && remainder > 0 && weeksLeft > 0) {
      const used = Math.min(remainder, weeksLeft);
      weeksLeft -= used;
      remainder -= used;
    }
    return { ...e, remainder_cents: remainder, closure: byEnvelope.get(e.id) ?? null };
  });
  return {
    month,
    ready,
    lines,
    weeks_saved_cents: saved?.total ?? 0,
    done: done === '1',
    pending: lines.filter((l) => !l.closure && l.remainder_cents !== 0).length,
  };
}

/** Clôture une enveloppe (reste ou dépassement). `date` = date du virement éventuel. */
export async function closeEnvelope(
  db: SQLiteDatabase,
  input: { envelopeId: number; action: ClosureAction; potId?: number; date: string },
): Promise<void> {
  const envelope = await db.getFirstAsync<{ month: MonthKey }>('SELECT month FROM envelopes WHERE id = ?', [input.envelopeId]);
  if (!envelope) throw new Error('Enveloppe introuvable');
  const line = (await getMonthClosure(db, envelope.month)).lines.find((l) => l.id === input.envelopeId);
  if (!line) throw new Error('Enveloppe introuvable');
  if (line.closure) throw new Error('Cette enveloppe est déjà clôturée.');
  const amount = line.remainder_cents;
  if (amount === 0) return;
  if (input.action === 'save' && (amount < 0 || !input.potId)) throw new Error('Choisis une cagnotte pour ce reste.');
  if (input.action === 'cover' && (amount > 0 || !input.potId)) throw new Error('Choisis une cagnotte pour couvrir ce dépassement.');

  const next = shiftMonthKey(envelope.month, 1);
  // Le mois suivant doit exister pour recevoir le report (hors transaction : ensureMonth a la sienne).
  if (input.action === 'carry') await ensureMonth(db, next);
  const monthName = monthKeyLabel(envelope.month).split(' ')[0];

  await db.withTransactionAsync(async () => {
    let moveId: number | null = null;
    let targetId: number | null = null;
    if (input.action === 'save' || input.action === 'cover') {
      const res = await db.runAsync(
        "INSERT INTO savings_moves (pot_id, amount_cents, date, note, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
        [
          input.potId!,
          amount,
          input.date,
          amount > 0 ? `Reste de ${monthName} · ${line.name}` : `Dépassement de ${monthName} · ${line.name}`,
        ],
      );
      moveId = Number(res.lastInsertRowId);
    } else {
      const target = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM envelopes WHERE month = ? AND name = ? AND period = ? ORDER BY id LIMIT 1',
        [next, line.name, line.period],
      );
      if (target) targetId = target.id;
      else {
        const res = await db.runAsync(
          `INSERT INTO envelopes (name, icon, color, weekly_cents, period, sort_order, created_at, month, template_id)
           VALUES (?, ?, ?, 0, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM envelopes WHERE month = ?), datetime('now'), ?, ?)`,
          [line.name, line.icon, line.color, line.period, next, next, line.template_id],
        );
        targetId = Number(res.lastInsertRowId);
      }
      await db.runAsync('UPDATE envelopes SET adjust_cents = adjust_cents + ? WHERE id = ?', [amount, targetId]);
    }
    await db.runAsync('UPDATE envelopes SET adjust_cents = adjust_cents - ? WHERE id = ?', [amount, input.envelopeId]);
    await db.runAsync(
      `INSERT INTO month_closures (envelope_id, action, amount_cents, move_id, target_envelope_id, closed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [input.envelopeId, input.action, amount, moveId, targetId],
    );
  });
  invalidateQueries();
}

/** Annule la clôture d'une enveloppe. */
export async function undoClosure(db: SQLiteDatabase, envelopeId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const c = await db.getFirstAsync<ClosureRow>('SELECT * FROM month_closures WHERE envelope_id = ?', [envelopeId]);
    if (c) await undoClosureRow(db, c);
  });
  invalidateQueries();
}

/** Marque le mois comme clôturé (le rappel disparaît) — ou le rouvre. */
export async function setMonthClosureDone(db: SQLiteDatabase, month: MonthKey, done: boolean): Promise<void> {
  await setMeta(db, doneKey(month), done ? '1' : null);
  invalidateQueries();
}

/**
 * Rappel de clôture : le mois précédent est fini, il a des enveloppes avec un
 * reste ou un dépassement non traité, et il n'a pas été marqué terminé.
 */
export async function getClosurePrompt(db: SQLiteDatabase, today: MonthKey = currentMonthKey()): Promise<MonthClosure | null> {
  const previous = shiftMonthKey(today, -1);
  const closure = await getMonthClosure(db, previous);
  return closure.ready && !closure.done && closure.pending > 0 ? closure : null;
}

/** Report reçu par une enveloppe (pour l'afficher dans son détail). */
export async function getCarryInto(
  db: SQLiteDatabase,
  envelopeId: number,
): Promise<{ amount_cents: number; from_month: MonthKey } | null> {
  const row = await db.getFirstAsync<{ n: number; amount_cents: number; from_month: MonthKey }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(c.amount_cents), 0) AS amount_cents, MIN(e.month) AS from_month
     FROM month_closures c JOIN envelopes e ON e.id = c.envelope_id
     WHERE c.target_envelope_id = ?`,
    [envelopeId],
  );
  return row && row.n > 0 ? { amount_cents: row.amount_cents, from_month: row.from_month } : null;
}
