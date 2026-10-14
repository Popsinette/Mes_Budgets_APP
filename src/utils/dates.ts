import { addDays, addMonths, differenceInCalendarDays, format, getDay, getDaysInMonth, parse, setDate } from 'date-fns';
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

/** "sept." — libellé court du mois pour les axes de graphique. */
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

/* ─── Semaines (lundi → dimanche), comme la méthode Budgetiz ─── */

/** Clé de semaine : date ISO 'yyyy-MM-dd' de son lundi. */
export type WeekKey = string;

function parseIso(isoDay: string): Date {
  return parse(isoDay, 'yyyy-MM-dd', new Date());
}

/** Lundi de la semaine contenant ce jour. */
export function weekKeyOf(isoDay: string): WeekKey {
  const date = parseIso(isoDay);
  return toIsoDay(addDays(date, -((getDay(date) + 6) % 7)));
}

export function currentWeekKey(): WeekKey {
  return weekKeyOf(todayIso());
}

export function shiftWeekKey(week: WeekKey, offset: number): WeekKey {
  return toIsoDay(addDays(parseIso(week), offset * 7));
}

/** "13 – 19 oct." ou "29 sept. – 5 oct." */
export function weekLabel(week: WeekKey): string {
  const start = parseIso(week);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${format(start, 'd')} – ${format(end, 'd MMM', { locale: fr })}`
    : `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM', { locale: fr })}`;
}

/** Une semaine appartient au mois de son lundi : un mois compte 4 ou 5 semaines. */
export function monthOfWeek(week: WeekKey): MonthKey {
  return week.slice(0, 7);
}

/** Les semaines (lundis) d'un mois. */
export function weeksOfMonth(month: MonthKey): WeekKey[] {
  const weeks: WeekKey[] = [];
  let week = weekKeyOf(`${month}-01`);
  if (monthOfWeek(week) !== month) week = shiftWeekKey(week, 1);
  while (monthOfWeek(week) === month) {
    weeks.push(week);
    week = shiftWeekKey(week, 1);
  }
  return weeks;
}

/** Jours restants jusqu'à dimanche inclus (7 le lundi, 1 le dimanche) ; 0 pour une semaine passée. */
export function daysLeftInWeek(week: WeekKey): number {
  const left = differenceInCalendarDays(addDays(parseIso(week), 6), new Date()) + 1;
  return Math.max(0, Math.min(7, left));
}

/** Fraction de la semaine écoulée (repère de rythme), `undefined` hors semaine courante. */
export function weekPaceRatio(week: WeekKey): number | undefined {
  if (week !== currentWeekKey()) return undefined;
  return (7 - daysLeftInWeek(week) + 1) / 7;
}

/** Nombre de mois entre deux clés (b − a). */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** "16/09/2026" */
export function numericDate(isoDay: string): string {
  return format(parseIso(isoDay), 'dd/MM/yyyy');
}

/** « Semaine 3/4 » pour le mois courant, « 4 semaines » sinon. */
export function weekProgressLabel(month: MonthKey): string {
  const weeks = weeksOfMonth(month);
  const index = weeks.indexOf(currentWeekKey());
  return index >= 0 ? `Semaine ${index + 1}/${weeks.length}` : `${weeks.length} semaines`;
}

/**
 * Grille de calendrier du mois, semaine commençant le lundi : des cases vides
 * (`null`) jusqu'au 1er, puis les dates ISO du mois.
 */
export function monthGrid(month: MonthKey): Array<string | null> {
  const start = parse(month, 'yyyy-MM', new Date());
  const leading = (getDay(start) + 6) % 7;
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: getDaysInMonth(start) }, (_, i) => isoDayInMonth(month, i + 1)),
  ];
}

/** Nombre de jours du mois. */
export function daysInMonthOf(month: MonthKey): number {
  return getDaysInMonth(parse(month, 'yyyy-MM', new Date()));
}
