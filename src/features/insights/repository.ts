import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackupStatus } from '@/src/features/backup/repository';
import { listEnvelopesForMonth } from '@/src/features/envelopes/repository';
import { listFixedForMonth } from '@/src/features/fixed/repository';
import { listPots } from '@/src/features/savings/repository';
import { getBalanceHistory, getMonthSummary, SPENDING_GROUPS, type SpendingGroup } from '@/src/features/summary/repository';
import { currentMonthKey, currentWeekKey, daysInMonthOf, monthsBetween, numericDate, type MonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

/**
 * Constats clés de l'Analyse : quelques phrases générées à partir des données
 * du mois (jamais stockées). Triées par gravité, 5 au plus.
 */

export type InsightTone = 'danger' | 'warning' | 'success' | 'info';

export type Insight = {
  key: string;
  tone: InsightTone;
  icon: string;
  title: string;
  detail: string;
};

const ORDER: Record<InsightTone, number> = { danger: 0, warning: 1, success: 2, info: 3 };
const MAX_INSIGHTS = 5;

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export async function getInsights(db: SQLiteDatabase, month: MonthKey): Promise<Insight[]> {
  const isCurrent = month === currentMonthKey();
  const [summary, envelopes, fixed, pots, history, backup] = await Promise.all([
    getMonthSummary(db, month),
    listEnvelopesForMonth(db, month, currentWeekKey()),
    listFixedForMonth(db, month),
    listPots(db, month),
    getBalanceHistory(db, month),
    getBackupStatus(db),
  ]);
  const insights: Insight[] = [];

  // 1. Le mois tient-il ? (même chiffre que la pastille « Prévisionnel »)
  const forecast = summary.forecast_left_cents;
  if (summary.income_cents > 0 || summary.expense_cents > 0) {
    insights.push(
      forecast < 0
        ? {
            key: 'forecast',
            tone: 'danger',
            icon: 'alert-circle',
            title: `Ton mois est dans le rouge de ${formatCents(-forecast)}`,
            detail: 'Tes dépenses prévues et faites dépassent tes revenus : réduis une enveloppe ou l’épargne programmée.',
          }
        : {
            key: 'forecast',
            tone: 'success',
            icon: 'checkmark-circle',
            title: `Ton plan tient : ${formatCents(forecast)} de marge`,
            detail: 'Revenus − charges − enveloppes − épargne programmée, dépassements compris.',
          },
    );
  }

  // 2. Enveloppes dépassées ou presque vides.
  const over = envelopes.filter((e) => e.budget_cents > 0 && e.spent_cents > e.budget_cents);
  if (over.length === 1) {
    const e = over[0];
    insights.push({
      key: 'over',
      tone: 'danger',
      icon: 'trending-up',
      title: `${e.name} dépasse de ${formatCents(e.spent_cents - e.budget_cents)}`,
      detail: `${formatCents(e.spent_cents)} dépensés pour ${formatCents(e.budget_cents)} prévus ce mois-ci.`,
    });
  } else if (over.length > 1) {
    insights.push({
      key: 'over',
      tone: 'danger',
      icon: 'trending-up',
      title: `${over.length} enveloppes dépassées (${formatCents(summary.overrun_cents)})`,
      detail: over.map((e) => `${e.name} +${formatCents(e.spent_cents - e.budget_cents)}`).join(' · '),
    });
  }
  const almost = envelopes
    .filter((e) => e.budget_cents > 0 && e.spent_cents <= e.budget_cents && e.spent_cents / e.budget_cents >= 0.9)
    .sort((a, b) => a.budget_cents - a.spent_cents - (b.budget_cents - b.spent_cents));
  if (almost.length > 0) {
    const e = almost[0];
    insights.push({
      key: 'almost',
      tone: 'warning',
      icon: 'hourglass-outline',
      title: `${e.name} presque vide : ${formatCents(e.budget_cents - e.spent_cents)} restants`,
      detail:
        almost.length > 1
          ? `Aussi à surveiller : ${almost.slice(1).map((x) => x.name).join(', ')}.`
          : `${pct(e.spent_cents, e.budget_cents)} % du budget du mois déjà utilisé.`,
    });
  }

  // 3. Rythme du budget variable (mois en cours uniquement).
  const budget = summary.variables_budget_cents;
  if (isCurrent && budget > 0) {
    const today = new Date().getDate();
    const days = daysInMonthOf(month);
    const elapsed = today / days;
    const spentRatio = summary.variables_spent_cents / budget;
    if (spentRatio > elapsed + 0.1) {
      const projected = Math.round(summary.variables_spent_cents / elapsed);
      insights.push({
        key: 'pace',
        tone: 'warning',
        icon: 'speedometer-outline',
        title: 'Tu dépenses plus vite que prévu',
        detail: `${Math.round(spentRatio * 100)} % du budget variable pour ${Math.round(elapsed * 100)} % du mois. À ce rythme : ${formatCents(projected)} sur ${formatCents(budget)}.`,
      });
    } else if (spentRatio < elapsed - 0.1) {
      insights.push({
        key: 'pace',
        tone: 'success',
        icon: 'speedometer-outline',
        title: 'Tu es en avance sur ton budget',
        detail: `${Math.round(spentRatio * 100)} % du budget variable dépensé pour ${Math.round(elapsed * 100)} % du mois écoulé.`,
      });
    }
  }

  // 4. Dépenses du mois comparées à la moyenne des mois précédents.
  const previous = history.filter((m) => m.month < month);
  if (previous.length >= 2 && summary.expense_cents > 0) {
    const avg = Math.round(
      previous.reduce((s, m) => s + (m.income_cents - m.balance_cents), 0) / previous.length,
    );
    const diff = avg > 0 ? (summary.expense_cents - avg) / avg : 0;
    if (Math.abs(diff) >= 0.1) {
      insights.push({
        key: 'vs-average',
        tone: diff > 0 ? 'warning' : 'success',
        icon: diff > 0 ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline',
        title: `Dépenses ${Math.round(Math.abs(diff) * 100)} % ${diff > 0 ? 'au-dessus' : 'en dessous'} de ta moyenne`,
        detail: `${formatCents(summary.expense_cents)} ce mois-ci contre ${formatCents(avg)} en moyenne sur ${previous.length} mois.`,
      });
    }
  }

  // 5. Cagnottes : objectif avec date limite en retard, ou atteint.
  for (const pot of pots) {
    if (!pot.target_cents) continue;
    if (pot.balance_cents >= pot.target_cents) {
      insights.push({
        key: `pot-${pot.id}`,
        tone: 'success',
        icon: 'trophy-outline',
        title: `Objectif atteint : ${pot.name}`,
        detail: `${formatCents(pot.balance_cents)} mis de côté pour un objectif de ${formatCents(pot.target_cents)}.`,
      });
    } else if (pot.deadline && pot.deadline.slice(0, 7) >= month) {
      const monthsLeft = Math.max(1, monthsBetween(month, pot.deadline.slice(0, 7)) + 1);
      const needed = Math.ceil((pot.target_cents - pot.balance_cents) / monthsLeft);
      if ((pot.monthly_cents ?? 0) < needed) {
        insights.push({
          key: `pot-${pot.id}`,
          tone: 'warning',
          icon: 'flag-outline',
          title: `${pot.name} : objectif du ${numericDate(pot.deadline)} en retard`,
          detail: `Il faudrait ${formatCents(needed)} par mois (programmé : ${formatCents(pot.monthly_cents ?? 0)}).`,
        });
      }
    }
  }

  // 6. Charges encore à débiter (mois en cours).
  if (isCurrent) {
    const pending = fixed.filter((f) => f.kind === 'charge' && !f.checked).sort((a, b) => a.day - b.day);
    if (pending.length > 0) {
      const total = pending.reduce((s, f) => s + f.amount_cents, 0);
      insights.push({
        key: 'pending',
        tone: 'info',
        icon: 'time-outline',
        title: `${formatCents(total)} de charges encore à débiter`,
        detail: `${pending.length} prélèvement${pending.length > 1 ? 's' : ''} d’ici la fin du mois — prochain : ${pending[0].name} le ${pending[0].day}.`,
      });
    }
  }

  // 7. Poste de dépense principal.
  if (summary.expense_cents > 0) {
    const [top, cents] = (Object.entries(summary.spending) as Array<[SpendingGroup, number]>).reduce((a, b) =>
      b[1] > a[1] ? b : a,
    );
    insights.push({
      key: 'top',
      tone: 'info',
      icon: 'pie-chart-outline',
      title: `${SPENDING_GROUPS[top].label} : ${pct(cents, summary.expense_cents)} % de tes dépenses`,
      detail: `${formatCents(cents)} sur ${formatCents(summary.expense_cents)} ce mois-ci.`,
    });
  }

  // 8. Sauvegarde trop ancienne (mois en cours) : les données ne sont que sur l'appareil.
  if (isCurrent && backup.due) {
    insights.push({
      key: 'backup',
      tone: 'warning',
      icon: 'cloud-upload-outline',
      title: backup.days === null ? 'Tu n’as jamais sauvegardé tes données' : `Dernière sauvegarde il y a ${backup.days} jours`,
      detail: 'Tout est sur cet appareil seulement : Réglages → Sauvegarder tout, puis garde le fichier dans Fichiers ou iCloud.',
    });
  }

  return insights.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]).slice(0, MAX_INSIGHTS);
}
