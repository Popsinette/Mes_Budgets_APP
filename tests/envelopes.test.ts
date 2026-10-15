import { beforeEach, describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  ensureMonth,
  isMonthReady,
  listEnvelopesForMonth,
  listTemplates,
  resetMonthFromBase,
  saveEnvelope,
  saveTemplate,
} from '@/src/features/envelopes/repository';
import { emptyDb } from './helpers/db';
import { seedScenario, spend } from './helpers/scenario';

let db: SQLiteDatabase;
beforeEach(async () => {
  ({ db } = await emptyDb());
  await seedScenario(db);
});

const list = (month: string) => listEnvelopesForMonth(db, month, '2000-01-03');

describe('enveloppes propres à chaque mois', () => {
  it('un mois pas encore ouvert suit la base (enveloppes virtuelles)', async () => {
    const env = await list('2026-11');
    expect(env.map((e) => [e.name, e.virtual, e.budget_cents])).toEqual([
      ['Courses', true, 40000],
      ['Essence', true, 15000],
    ]);
    expect(await isMonthReady(db, '2026-11')).toBe(false);
  });

  it('noter une dépense ouvre le mois avec une copie de la base', async () => {
    await spend(db, '2026-11', 'Courses', 2000, '2026-11-03');
    const env = await list('2026-11');
    expect(env.every((e) => !e.virtual)).toBe(true);
    expect(env.find((e) => e.name === 'Courses')?.spent_cents).toBe(2000);
  });

  it('modifier la base ne touche pas un mois déjà ouvert', async () => {
    await ensureMonth(db, '2026-10');
    const courses = (await listTemplates(db)).find((t) => t.name === 'Courses')!;
    await saveTemplate(db, { ...courses, amountCents: 12000 });
    expect((await list('2026-10')).find((e) => e.name === 'Courses')?.weekly_cents).toBe(10000);
    expect((await list('2026-12')).find((e) => e.name === 'Courses')?.weekly_cents).toBe(12000);
  });

  it('une enveloppe créée dans un mois n’existe pas ailleurs', async () => {
    await saveEnvelope(db, { month: '2026-11', name: 'Anniversaire', icon: 'gift-outline', color: '#C372A8', amountCents: 5000, period: 'week' });
    expect((await list('2026-11')).some((e) => e.name === 'Anniversaire')).toBe(true);
    expect((await list('2026-12')).some((e) => e.name === 'Anniversaire')).toBe(false);
    expect((await list('2026-10')).some((e) => e.name === 'Anniversaire')).toBe(false);
  });

  it('« Repartir de ma base » garde les enveloppes qui ont des dépenses', async () => {
    await spend(db, '2026-10', 'Courses', 2000, '2026-10-06');
    await saveEnvelope(db, { month: '2026-10', name: 'Cadeau', icon: 'gift-outline', color: '#C372A8', amountCents: 3000, period: 'month' });
    await resetMonthFromBase(db, '2026-10');
    const names = (await list('2026-10')).map((e) => e.name).sort();
    expect(names).toEqual(['Courses', 'Essence']);
  });
});
