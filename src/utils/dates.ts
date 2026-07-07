import { addMonths, format, parse } from 'date-fns';
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

/** "mars 2027" — le mois situé à `offset` mois d'aujourd'hui. */
export function monthLabelFromNow(offset: number): string {
  return format(addMonths(new Date(), offset), 'MMMM yyyy', { locale: fr });
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
