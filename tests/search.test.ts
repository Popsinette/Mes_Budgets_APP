import { beforeEach, describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { searchExpenses } from '@/src/features/envelopes/repository';
import { emptyDb } from './helpers/db';
import { seedScenario, spend } from './helpers/scenario';

let db: SQLiteDatabase;
beforeEach(async () => {
  ({ db } = await emptyDb());
  await seedScenario(db);
  await spend(db, '2026-10', 'Courses', 2340, '2026-10-06');
  await spend(db, '2026-10', 'Essence', 6000, '2026-10-07');
  await spend(db, '2026-11', 'Courses', 1500, '2026-11-03');
  await db.runAsync("UPDATE expenses SET label = 'Café Carrefour' WHERE amount_cents = 2340");
  await db.runAsync("UPDATE expenses SET label = 'Carrefour market' WHERE amount_cents = 1500");
});

const labels = async (month: string | null, query: string) =>
  (await searchExpenses(db, { month, query })).map((x) => x.label);

describe('recherche dans les dépenses', () => {
  it('sans recherche : toutes les dépenses du mois, les plus récentes d’abord', async () => {
    expect(await labels('2026-10', '')).toEqual(['Essence', 'Café Carrefour']);
  });

  it('trouve par libellé, sans tenir compte des accents ni des majuscules', async () => {
    expect(await labels('2026-10', 'cafe')).toEqual(['Café Carrefour']);
    expect(await labels(null, 'CARREFOUR')).toEqual(['Carrefour market', 'Café Carrefour']);
  });

  it('trouve par enveloppe et par montant', async () => {
    expect(await labels(null, 'courses')).toEqual(['Carrefour market', 'Café Carrefour']);
    expect(await labels(null, '23')).toEqual(['Café Carrefour']);
    expect(await labels(null, '23,40')).toEqual(['Café Carrefour']);
    expect(await labels(null, '60 €')).toEqual(['Essence']);
  });

  it('tous les mots doivent correspondre', async () => {
    expect(await labels(null, 'carrefour market')).toEqual(['Carrefour market']);
    expect(await labels(null, 'carrefour essence')).toEqual([]);
  });
});
