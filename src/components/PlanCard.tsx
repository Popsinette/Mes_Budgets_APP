import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { MonthSummary } from '@/src/features/summary/repository';
import { spacing, useTheme } from '@/src/theme';
import { weeksOfMonth, type MonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';
import { Card } from './ui/Card';
import { Body, Caption, Heading, Money } from './ui/Text';

/**
 * « Mon plan du mois » : ce qui est prévu (revenus, charges, postes,
 * enveloppes, épargne) et ce qu'il reste à répartir ; puis, s'il y en a, les
 * dépassements et frais de santé qui donnent le reste prévisionnel.
 */
export function PlanCard({ summary, month }: { summary: MonthSummary; month: MonthKey }) {
  const theme = useTheme();
  const weeks = weeksOfMonth(month).length;
  const weeklyTotal = weeks > 0 ? Math.round(summary.variables_budget_cents / weeks) : 0;
  const lines: Array<[string, number, string?]> = [
    ['Revenus prévus', summary.income_cents],
    ['Factures et charges fixes', -summary.charges_cents],
    ['Enveloppes de la semaine', -summary.variables_budget_cents, `${weeks} semaines × ${formatCents(weeklyTotal)}`],
    ['Montants fixes du mois', -summary.postes_budget_cents, 'Coiffure, essence…'],
    ['Épargne programmée', -summary.savings_planned_cents],
  ];
  const plan = summary.plan_left_cents;
  const forecast = summary.forecast_left_cents;
  const extras = summary.overrun_cents > 0 || summary.spending.sante > 0;
  const red = forecast < 0;

  return (
    <Card style={{ gap: spacing.sm, borderColor: red ? theme.colors.danger : theme.colors.border }}>
      <Heading>Mon plan du mois</Heading>
      {lines.map(([label, cents, hint]) => (
        <View key={label} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Body size={14.5}>{label}</Body>
            {hint ? <Caption>{hint}</Caption> : null}
          </View>
          <Money cents={cents} size={15} signed={cents !== 0} />
        </View>
      ))}
      <View style={[styles.divider, { backgroundColor: theme.colors.hairline }]} />
      <View style={styles.row}>
        <Body weight="semibold" style={{ flex: 1 }}>
          Reste à répartir
        </Body>
        <Money cents={plan} size={16} weight="bold" tone={plan < 0 ? 'danger' : 'text'} />
      </View>
      {extras ? (
        <>
          {summary.overrun_cents > 0 ? (
            <View style={styles.row}>
              <Body size={14.5} style={{ flex: 1 }}>
                Dépassements d’enveloppes
              </Body>
              <Money cents={-summary.overrun_cents} size={15} signed tone="danger" />
            </View>
          ) : null}
          {summary.spending.sante > 0 ? (
            <View style={styles.row}>
              <Body size={14.5} style={{ flex: 1 }}>
                Santé (reste à charge)
              </Body>
              <Money cents={-summary.spending.sante} size={15} signed />
            </View>
          ) : null}
          <View style={styles.row}>
            <Body weight="semibold" style={{ flex: 1 }}>
              Reste prévisionnel
            </Body>
            <Money cents={forecast} size={16} weight="bold" tone={red ? 'danger' : 'text'} />
          </View>
        </>
      ) : null}
      <View style={[styles.verdict, { backgroundColor: red ? theme.colors.dangerSoft : theme.colors.successSoft }]}>
        <Ionicons
          name={red ? 'alert-circle' : 'checkmark-circle'}
          size={18}
          color={red ? theme.colors.danger : theme.colors.success}
        />
        <Body size={13.5} style={{ flex: 1 }} color={red ? theme.colors.danger : theme.colors.success}>
          {red
            ? plan < 0
              ? `Ton plan dépasse tes revenus de ${formatCents(-forecast)} : réduis une enveloppe, un montant fixe ou l’épargne programmée.`
              : `Tes dépassements te mettent dans le rouge de ${formatCents(-forecast)} : freine sur les enveloppes qui débordent ou ajuste ton plan.`
            : forecast === 0
              ? 'Chaque euro a sa place : ton plan tient.'
              : `Ton plan tient : ${formatCents(forecast)} à placer (cagnotte, enveloppe…).`}
        </Body>
      </View>
      {red ? (
        <Body
          size={13.5}
          weight="semibold"
          color={theme.colors.primary}
          onPress={() => router.push('/enveloppes')}
          accessibilityRole="link"
        >
          Ajuster mes enveloppes →
        </Body>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: 12,
    marginTop: spacing.xs,
  },
});
