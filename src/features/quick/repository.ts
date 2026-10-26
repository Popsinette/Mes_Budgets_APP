import type { SQLiteDatabase } from 'expo-sqlite';
import { normalizeSearch, type EnvelopePeriod } from '@/src/features/envelopes/repository';

/**
 * Saisie express : les dépenses qui reviennent dans l'historique (même
 * libellé) deviennent des raccourcis — libellé, enveloppe et montant
 * habituels pré-remplis en un toucher — et servent à deviner l'enveloppe
 * pendant qu'on tape un libellé.
 */

export type ExpenseSuggestion = {
  label: string;
  envelope_name: string;
  envelope_period: EnvelopePeriod;
  /** Montant habituel : le plus fréquent, sinon le plus récent. */
  amount_cents: number;
  count: number;
  last_date: string;
};

/** Libellés notés depuis `days` jours, du plus fréquent au moins fréquent (puis du plus récent). */
export async function getExpenseSuggestions(db: SQLiteDatabase, today: string, days = 120): Promise<ExpenseSuggestion[]> {
  const rows = await db.getAllAsync<{ label: string; name: string; period: EnvelopePeriod; amount_cents: number; date: string }>(
    `SELECT x.label, e.name, e.period, x.amount_cents, x.date
     FROM expenses x JOIN envelopes e ON e.id = x.envelope_id
     WHERE x.date >= date(?, ?) AND x.date <= ?
     ORDER BY x.date DESC, x.id DESC`,
    [today, `-${days} days`, today],
  );
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = normalizeSearch(r.label);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const mostFrequent = <T>(values: T[]): T => {
    const counts = new Map<T, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    // À égalité, le premier rencontré (= le plus récent) l'emporte.
    return [...counts.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
  };
  return [...groups.values()]
    .map((list) => {
      const envelope = mostFrequent(list.map((r) => `${r.period}|${r.name}`));
      const [period, name] = envelope.split('|') as [EnvelopePeriod, string];
      return {
        label: list[0].label,
        envelope_name: name,
        envelope_period: period,
        amount_cents: mostFrequent(list.map((r) => r.amount_cents)),
        count: list.length,
        last_date: list[0].date,
      };
    })
    .sort((a, b) => b.count - a.count || b.last_date.localeCompare(a.last_date));
}

/** Suggestion qui correspond au début d'un libellé tapé (3 lettres au moins), sans accents ni casse. */
export function matchSuggestion(list: ExpenseSuggestion[], typed: string): ExpenseSuggestion | null {
  const q = normalizeSearch(typed);
  if (q.length < 3) return null;
  return list.find((s) => normalizeSearch(s.label) === q) ?? list.find((s) => normalizeSearch(s.label).startsWith(q)) ?? null;
}
