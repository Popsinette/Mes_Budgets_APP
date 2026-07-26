import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BarChart } from '@/src/components/charts/BarChart';
import { Card } from '@/src/components/ui/Card';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getYearOverview } from '@/src/features/transactions/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { shortMonthLabel, type MonthKey } from '@/src/utils/dates';

export default function YearScreen() {
  const theme = useTheme();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const [year, setYear] = useState(Number(month.slice(0, 4)));

  const { data: points } = useLiveQuery((db) => getYearOverview(db, year), [year]);
  const months = points ?? [];

  const income = months.reduce((s, m) => s + m.income_cents, 0);
  const expense = months.reduce((s, m) => s + m.expense_cents, 0);
  const saved = months.reduce((s, m) => s + m.saved_cents, 0);
  const balance = income - expense - saved;
  const monthsWithData = months.filter((m) => m.income_cents > 0 || m.expense_cents > 0).length;
  const avg = (cents: number) => (monthsWithData > 0 ? Math.round(cents / monthsWithData) : 0);
  const savingsRate = income > 0 ? Math.round((saved / income) * 100) : 0;

  const openMonth = (key: MonthKey) => {
    setMonth(key);
    router.back();
  };

  const kpis: Array<[string, number, string]> = [
    ['Revenus de l’année', income, `${formatAvg(avg(income))} / mois en moyenne`],
    ['Dépensé sur l’année', expense, `${formatAvg(avg(expense))} / mois en moyenne`],
    ['Épargné (viré)', saved, `${savingsRate} % des revenus`],
    ['Solde de l’année', balance, 'revenus − dépenses − épargne virée'],
  ];

  return (
    <Screen>
      <ModalHeader title="Vue annuelle" />

      <View style={styles.yearRow}>
        <Pressable
          hitSlop={8}
          onPress={() => setYear((y) => y - 1)}
          accessibilityRole="button"
          accessibilityLabel="Année précédente"
          style={[styles.yearButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </Pressable>
        <Title>{year}</Title>
        <Pressable
          hitSlop={8}
          onPress={() => setYear((y) => y + 1)}
          accessibilityRole="button"
          accessibilityLabel="Année suivante"
          style={[styles.yearButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      <View style={styles.kpiGrid}>
        {kpis.map(([label, value, hint]) => (
          <Card key={label} style={styles.kpiCard}>
            <Eyebrow>{label}</Eyebrow>
            <Money cents={value} size={19} weight="bold" tone={value < 0 ? 'danger' : 'text'} />
            <Caption style={{ fontSize: 11 }}>{hint}</Caption>
          </Card>
        ))}
      </View>

      <SectionHeader title="Revenus et dépenses" />
      <Card style={{ gap: spacing.md }}>
        <BarChart
          groups={months.map((point) => ({
            label: shortMonthLabel(point.month),
            bars: [
              { value: point.income_cents, color: theme.colors.income },
              { value: point.expense_cents, color: theme.colors.expense },
            ],
          }))}
        />
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
            <Caption>Revenus</Caption>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.expense }]} />
            <Caption>Dépenses</Caption>
          </View>
        </View>
      </Card>

      <SectionHeader title="Mois par mois" />
      <Card style={{ gap: 2, paddingVertical: spacing.sm }}>
        <View style={styles.tableRow}>
          <Caption style={styles.colMonth}>Mois</Caption>
          <Caption style={styles.colNum}>Revenus</Caption>
          <Caption style={styles.colNum}>Dépenses</Caption>
          <Caption style={styles.colNum}>Épargné</Caption>
          <Caption style={styles.colNum}>Solde</Caption>
        </View>
        {months.map((point) => {
          const solde = point.income_cents - point.expense_cents - point.saved_cents;
          const isCurrent = point.month === month;
          const empty = point.income_cents === 0 && point.expense_cents === 0 && point.saved_cents === 0;
          return (
            <Pressable
              key={point.month}
              onPress={() => openMonth(point.month)}
              accessibilityRole="button"
              accessibilityLabel={`Ouvrir ${shortMonthLabel(point.month)}`}
              style={[
                styles.tableRow,
                styles.tableRowLine,
                { borderTopColor: theme.colors.hairline },
                isCurrent && { backgroundColor: theme.colors.cardMuted, borderRadius: radius.sm },
              ]}
            >
              <Body
                weight={isCurrent ? 'semibold' : 'medium'}
                size={13}
                style={styles.colMonth}
                tone={empty ? 'muted' : 'text'}
              >
                {shortMonthLabel(point.month)}
              </Body>
              <Money cents={point.income_cents} size={12.5} tone={empty ? 'muted' : 'text'} style={styles.colNum} />
              <Money cents={point.expense_cents} size={12.5} tone={empty ? 'muted' : 'text'} style={styles.colNum} />
              <Money cents={point.saved_cents} size={12.5} tone={empty ? 'muted' : 'text'} style={styles.colNum} />
              <Money
                cents={solde}
                size={12.5}
                weight="semibold"
                tone={empty ? 'muted' : solde < 0 ? 'danger' : 'success'}
                style={styles.colNum}
              />
            </Pressable>
          );
        })}
      </Card>
      <Caption style={{ textAlign: 'center' }}>
        Touchez un mois pour l'ouvrir dans toute l'application.
      </Caption>
    </Screen>
  );
}

function formatAvg(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

const styles = StyleSheet.create({
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yearButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCard: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: 3,
    padding: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  tableRowLine: {
    borderTopWidth: 1,
  },
  colMonth: {
    width: 52,
  },
  colNum: {
    flex: 1,
    textAlign: 'right',
  },
});
