import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteTransaction,
  getMonthTotals,
  listTransactionsForMonth,
  type TransactionWithCategory,
} from '@/src/features/transactions/repository';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, shortDayLabel } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

type Filter = 'all' | 'expense' | 'income';

export default function OperationsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [month, setMonth] = useState(currentMonthKey());
  const [filter, setFilter] = useState<Filter>('all');

  const { data: transactions } = useLiveQuery((db) => listTransactionsForMonth(db, month), [month]);
  const { data: totals } = useLiveQuery((db) => getMonthTotals(db, month), [month]);

  const filtered = useMemo(
    () => (transactions ?? []).filter((t) => filter === 'all' || t.type === filter),
    [transactions, filter],
  );

  /** Regroupe par jour, du plus récent au plus ancien. */
  const sections = useMemo(() => {
    const byDay = new Map<string, TransactionWithCategory[]>();
    for (const t of filtered) {
      const list = byDay.get(t.date) ?? [];
      list.push(t);
      byDay.set(t.date, list);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const confirmDelete = (t: TransactionWithCategory) => {
    confirmAction({
      title: 'Supprimer l’opération',
      message: `Supprimer « ${t.label} » (${formatCents(t.amount_cents)}) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteTransaction(db, t.id),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={72}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Opérations</Text>
        <MonthSwitcher month={month} onChange={setMonth} />

        <View style={styles.totalsRow}>
          <Card style={styles.totalCard}>
            <View style={[styles.totalIcon, { backgroundColor: theme.colors.successSoft }]}>
              <Ionicons name="arrow-down" size={16} color={theme.colors.success} />
            </View>
            <Text style={[styles.totalValue, { color: theme.colors.text }]}>
              {formatCents(totals?.income_cents ?? 0)}
            </Text>
            <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>Revenus</Text>
          </Card>
          <Card style={styles.totalCard}>
            <View style={[styles.totalIcon, { backgroundColor: theme.colors.dangerSoft }]}>
              <Ionicons name="arrow-up" size={16} color={theme.colors.danger} />
            </View>
            <Text style={[styles.totalValue, { color: theme.colors.text }]}>
              {formatCents(totals?.expense_cents ?? 0)}
            </Text>
            <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>Dépenses</Text>
          </Card>
        </View>

        <View style={styles.filters}>
          <Chip label="Tout" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip
            label="Dépenses"
            selected={filter === 'expense'}
            color={theme.colors.danger}
            onPress={() => setFilter('expense')}
          />
          <Chip
            label="Revenus"
            selected={filter === 'income'}
            color={theme.colors.success}
            onPress={() => setFilter('income')}
          />
        </View>

        {sections.length === 0 ? (
          <Card>
            <EmptyState
              icon="swap-vertical"
              title="Aucune opération"
              subtitle="Ajoutez une dépense ou un revenu avec le bouton +"
            />
          </Card>
        ) : (
          sections.map(([day, items]) => (
            <View key={day} style={{ gap: spacing.sm }}>
              <Text style={[styles.dayLabel, { color: theme.colors.textMuted }]}>{shortDayLabel(day)}</Text>
              <Card style={{ gap: spacing.md, paddingVertical: spacing.md }}>
                {items.map((t) => (
                  <View key={t.id} style={styles.txRow}>
                    <CategoryIcon
                      icon={t.type === 'income' ? 'arrow-down-outline' : (t.category_icon ?? 'pricetag-outline')}
                      color={t.type === 'income' ? theme.colors.success : (t.category_color ?? theme.colors.primary)}
                      size={38}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.txLabel, { color: theme.colors.text }]} numberOfLines={1}>
                        {t.label}
                      </Text>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        {t.type === 'income' ? 'Revenu' : (t.category_name ?? 'Sans catégorie')}
                        {t.note ? ` · ${t.note}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text
                        style={[
                          styles.txAmount,
                          { color: t.type === 'income' ? theme.colors.income : theme.colors.text },
                        ]}
                      >
                        {formatCents(t.type === 'income' ? t.amount_cents : -t.amount_cents, { signed: true })}
                      </Text>
                      <Text
                        onPress={() => confirmDelete(t)}
                        style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' }}
                      >
                        Supprimer
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </Screen>
      <FAB onPress={() => router.push('/nouvelle-transaction')} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  totalsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  totalCard: {
    flex: 1,
    gap: spacing.xs,
  },
  totalIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  txLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
