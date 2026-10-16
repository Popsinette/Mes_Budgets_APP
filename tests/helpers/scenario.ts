import type { SQLiteDatabase } from 'expo-sqlite';
import { listEnvelopesForMonth, resolveEnvelopeId, saveExpense, saveTemplate } from '@/src/features/envelopes/repository';
import { saveFixedItem } from '@/src/features/fixed/repository';
import { listPots, savePot } from '@/src/features/savings/repository';
import type { MonthKey } from '@/src/utils/dates';

/**
 * Budget type : 2 000 € de salaire, 800 € de loyer, Courses 100 €/semaine,
 * Essence 150 €/mois, cagnotte Vacances 200 €/mois.
 */
export async function seedScenario(db: SQLiteDatabase): Promise<void> {
  await saveFixedItem(db, { kind: 'income', name: 'Salaire', amountCents: 200000, day: 1, frequency: 'monthly', startMonth: '2026-01', icon: null });
  await saveFixedItem(db, { kind: 'charge', name: 'Loyer', amountCents: 80000, day: 5, frequency: 'monthly', startMonth: '2026-01', icon: null });
  await saveTemplate(db, { name: 'Courses', icon: 'cart-outline', color: '#C97558', amountCents: 10000, period: 'week' });
  await saveTemplate(db, { name: 'Essence', icon: 'car-outline', color: '#B8892F', amountCents: 15000, period: 'month' });
  await savePot(db, {
    name: 'Vacances',
    icon: 'airplane-outline',
    color: '#2AA0B0',
    kind: 'projet',
    initialCents: 0,
    targetCents: null,
    monthlyCents: 20000,
    deadline: null,
  });
}

/** Ajoute une dépense dans l'enveloppe `name` du mois (ouvre le mois si besoin). */
export async function spend(
  db: SQLiteDatabase,
  month: MonthKey,
  name: string,
  cents: number,
  date: string,
  cleared = false,
): Promise<number> {
  const envelope = (await listEnvelopesForMonth(db, month, '2000-01-03')).find((e) => e.name === name);
  if (!envelope) throw new Error(`Enveloppe ${name} absente de ${month}`);
  const id = await resolveEnvelopeId(db, envelope);
  if (!id) throw new Error('Enveloppe introuvable');
  await saveExpense(db, { envelopeId: id, label: name, amountCents: cents, date, cleared });
  return id;
}

export async function vacances(db: SQLiteDatabase, month: MonthKey) {
  const pot = (await listPots(db, month)).find((p) => p.name === 'Vacances');
  if (!pot) throw new Error('Cagnotte absente');
  return pot;
}
