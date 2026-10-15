import { describe, expect, it } from 'vitest';
import { monthOfWeek, weekKeyOf, weeksOfMonth } from '@/src/utils/dates';
import { formatCents, parseAmountToCents } from '@/src/utils/money';

describe('semaines (règle du jeudi)', () => {
  it('une semaine appartient au mois de son jeudi', () => {
    expect(monthOfWeek('2026-09-28')).toBe('2026-10'); // jeudi 1er octobre
    expect(monthOfWeek('2026-11-30')).toBe('2026-12'); // jeudi 3 décembre
    expect(monthOfWeek('2026-10-26')).toBe('2026-10'); // jeudi 29 octobre
  });

  it('octobre 2026 a 5 semaines, novembre 4', () => {
    expect(weeksOfMonth('2026-10')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(weeksOfMonth('2026-11')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  });

  it('chaque semaine tombe dans exactement un mois', () => {
    const all = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].flatMap(weeksOfMonth);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(52);
  });

  it('la semaine d’un jour = son lundi', () => {
    expect(weekKeyOf('2026-10-18')).toBe('2026-10-12'); // dimanche
    expect(weekKeyOf('2026-10-12')).toBe('2026-10-12');
  });
});

describe('montants', () => {
  it('lit les saisies en centimes', () => {
    expect(parseAmountToCents('12,50')).toBe(1250);
    expect(parseAmountToCents('12.5')).toBe(1250);
    expect(parseAmountToCents('80')).toBe(8000);
    expect(parseAmountToCents('abc')).toBeNull();
  });

  it('formate en euros', () => {
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('1 234,56 €');
    expect(formatCents(-500, { signed: true }).replace(/\s/g, ' ')).toMatch(/^[−-]5,00 €$/);
  });
});
