import { addMonths, format, getDaysInMonth, parse, setDate } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Clé de mois au format 'YYYY-MM', utilisée partout en base. */
export type MonthKey = string;

export function monthKeyFromDate(date: Date): MonthKey {
  return format(date, 'yyyy-MM');
}

export function currentMonthKey(): MonthKey {
  return monthKeyFromDate(new Date());
}

export function shiftMonthKey(month: MonthKey, offset: number): MonthKey {
  const date = parse(month, 'yyyy-MM', new Date());
  return monthKeyFromDate(addMonths(date, offset));
}

/** "juillet 2026" */
export function monthKeyLabel(month: MonthKey): string {
  const date = parse(month, 'yyyy-MM', new Date());
  return format(date, 'MMMM yyyy', { locale: fr });
}

/** Date ISO 'yyyy-MM-dd' pour la base. */
export function toIsoDay(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function todayIso(): string {
  return toIsoDay(new Date());
}

/** "5 juillet" */
export function shortDayLabel(isoDay: string): string {
  const date = parse(isoDay, 'yyyy-MM-dd', new Date());
  return format(date, 'd MMMM', { locale: fr });
}

/** "juil." — libellé court du mois pour les axes de graphique. */
export function shortMonthLabel(month: MonthKey): string {
  const date = parse(month, 'yyyy-MM', new Date());
  return format(date, 'MMM', { locale: fr });
}

/** Date ISO du jour `day` dans le mois donné, bornée à la fin du mois (le 31 → le 28 en février). */
export function isoDayInMonth(month: MonthKey, day: number): string {
  const start = parse(month, 'yyyy-MM', new Date());
  const lastDay = getDaysInMonth(start);
  return format(setDate(start, Math.min(Math.max(1, day), lastDay)), 'yyyy-MM-dd');
}

/**
 * Date du jour ramenée dans le mois donné : aujourd'hui si c'est le mois
 * courant, sinon le même quantième dans ce mois (borné à sa fin). Sert à dater
 * une saisie/un pointage du jour sans jamais sortir du mois affiché (la colonne
 * `month` des transactions porte les agrégats).
 */
export function todayInMonth(month: MonthKey): string {
  if (month === currentMonthKey()) return todayIso();
  return isoDayInMonth(month, new Date().getDate());
}

/** "mars 2027" — le mois situé à `offset` mois d'aujourd'hui. */
export function monthLabelFromNow(offset: number): string {
  return format(addMonths(new Date(), offset), 'MMMM yyyy', { locale: fr });
}

/**
 * Fraction du mois écoulée (0..1) pour le mois courant — sert de repère de
 * rythme sur les jauges de budget. `undefined` pour tout autre mois (pas de
 * rythme pertinent sur un mois passé ou futur).
 */
export function monthPaceRatio(month: MonthKey): number | undefined {
  if (month !== currentMonthKey()) return undefined;
  const now = new Date();
  return now.getDate() / getDaysInMonth(now);
}

/** Les n derniers mois (mois courant inclus), du plus ancien au plus récent. */
export function lastMonthKeys(n: number): MonthKey[] {
  const current = currentMonthKey();
  const keys: MonthKey[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(shiftMonthKey(current, -i));
  }
  return keys;
}
