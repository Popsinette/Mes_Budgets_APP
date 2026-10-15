import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { searchExpenses, type Expense } from '@/src/features/envelopes/repository';
import { useSelectedMonth } from '@/src/store/month';
import { fonts, radius, spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, shortDayLabel } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

/** « Mes dépenses » : toutes les dépenses du mois (ou de tous les mois), avec recherche. */
export default function ExpensesModal() {
  const theme = useTheme();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const [query, setQuery] = useState('');
  const [allMonths, setAllMonths] = useState(false);
  const { data } = useLiveQuery(
    (db) => searchExpenses(db, { month: allMonths ? null : month, query }),
    [month, allMonths, query],
  );
  const expenses = data ?? [];
  const total = expenses.reduce((s, x) => s + x.amount_cents, 0);
  const groups = groupBy(expenses, (x) => (allMonths ? x.date.slice(0, 7) : x.date));

  return (
    <Screen>
      <ModalHeader title="Mes dépenses" />
      {allMonths ? null : <MonthSwitcher month={month} onChange={setMonth} />}

      <View style={[styles.search, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Carrefour, essence, 23…"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Rechercher une dépense"
          autoCorrect={false}
          style={[styles.input, { color: theme.colors.text }]}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chips}>
        <Chip label={allMonths ? monthKeyLabel(month) : `Ce mois-ci`} selected={!allMonths} onPress={() => setAllMonths(false)} />
        <Chip label="Tous les mois" selected={allMonths} onPress={() => setAllMonths(true)} />
      </View>

      <View style={styles.totalRow}>
        <Body weight="semibold" style={{ flex: 1 }}>
          {expenses.length === 0 ? 'Aucune dépense' : expenses.length === 1 ? '1 dépense' : `${expenses.length} dépenses`}
        </Body>
        <Money cents={total} size={17} weight="bold" />
      </View>

      {expenses.length === 0 ? (
        <Card>
          <EmptyState
            icon={query ? 'search-outline' : 'receipt-outline'}
            title={query ? 'Rien trouvé' : 'Aucune dépense'}
            subtitle={query ? 'Essaie un autre mot, un nom d’enveloppe ou un montant.' : 'Les dépenses notées apparaîtront ici.'}
          />
        </Card>
      ) : (
        groups.map(([key, items]) => (
          <View key={key} style={{ gap: spacing.xs }}>
            <View style={styles.groupHead}>
              <Eyebrow style={{ flex: 1 }}>{allMonths ? monthKeyLabel(key) : shortDayLabel(key)}</Eyebrow>
              <Caption>{formatCents(items.reduce((s, x) => s + x.amount_cents, 0))}</Caption>
            </View>
            <Card style={{ paddingVertical: spacing.xs }}>
              {items.map((x, i) => (
                <ExpenseRow key={x.id} expense={x} showDate={allMonths} last={i === items.length - 1} />
              ))}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}

function ExpenseRow({ expense, showDate, last }: { expense: Expense; showDate: boolean; last: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/depense', params: { id: String(expense.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${expense.label}, ${formatCents(expense.amount_cents)}, ${expense.envelope_name}. Modifier`}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.hairline },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <CategoryIcon icon={expense.envelope_icon} color={expense.envelope_color} size={34} />
      <View style={{ flex: 1 }}>
        <Body weight="medium" numberOfLines={1}>
          {expense.label}
        </Body>
        <Caption numberOfLines={1}>
          {expense.envelope_name}
          {showDate ? ` · ${shortDayLabel(expense.date)}` : ''}
        </Caption>
      </View>
      <Money cents={-expense.amount_cents} signed size={15} weight="semibold" tone="expense" />
    </Pressable>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return [...map.entries()];
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', gap: spacing.sm },
  totalRow: { flexDirection: 'row', alignItems: 'center' },
  groupHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
});
