import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteTransaction,
  getMonthTotals,
  listTransactionsForMonth,
  setTransactionCleared,
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

  const pending = useMemo(() => filtered.filter((t) => t.cleared === 0), [filtered]);
  const clearedTx = useMemo(() => filtered.filter((t) => t.cleared === 1), [filtered]);

  // Solde réel = opérations pointées ; prévisionnel = tout (pointé + à venir).
  const realBalance = (totals?.cleared_income_cents ?? 0) - (totals?.cleared_expense_cents ?? 0);
  const plannedBalance = (totals?.income_cents ?? 0) - (totals?.expense_cents ?? 0);

  const togglePointed = (t: TransactionWithCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setTransactionCleared(db, t.id, t.cleared === 0);
  };

  const confirmDelete = (t: TransactionWithCategory) => {
    confirmAction({
      title: 'Supprimer l’opération',
      message: `Supprimer « ${t.label} » (${formatCents(t.amount_cents)}) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteTransaction(db, t.id),
    });
  };

  const renderRow = (t: TransactionWithCategory) => {
    const isPending = t.cleared === 0;
    return (
      <View key={t.id} style={styles.txRow}>
        <Pressable hitSlop={8} onPress={() => togglePointed(t)}>
          <Ionicons
            name={isPending ? 'ellipse-outline' : 'checkmark-circle'}
            size={26}
            color={isPending ? theme.colors.textMuted : theme.colors.success}
          />
        </Pressable>
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
            {shortDayLabel(t.date)}
            {' · '}
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
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={72}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Opérations</Text>
        <MonthSwitcher month={month} onChange={setMonth} />

        <View style={styles.totalsRow}>
          <Card style={styles.totalCard}>
            <View style={[styles.totalIcon, { backgroundColor: theme.colors.successSoft }]}>
              <Ionicons name="checkmark-done" size={16} color={theme.colors.success} />
            </View>
            <Text
              style={[
                styles.totalValue,
                { color: realBalance < 0 ? theme.colors.danger : theme.colors.text },
              ]}
            >
              {formatCents(realBalance)}
            </Text>
            <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>Réel (pointé)</Text>
          </Card>
          <Card style={styles.totalCard}>
            <View style={[styles.totalIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name="hourglass-outline" size={16} color={theme.colors.primary} />
            </View>
            <Text
              style={[
                styles.totalValue,
                { color: plannedBalance < 0 ? theme.colors.danger : theme.colors.text },
              ]}
            >
              {formatCents(plannedBalance)}
            </Text>
            <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>Prévisionnel</Text>
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

        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon="swap-vertical"
              title="Aucune opération"
              subtitle="Ajoutez une dépense ou un revenu avec le bouton +"
            />
          </Card>
        ) : (
          <>
            {pending.length > 0 ? (
              <>
                <SectionHeader title={`À pointer (${pending.length})`} />
                <Card style={{ gap: spacing.md, paddingVertical: spacing.md }}>
                  {pending.map(renderRow)}
                </Card>
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                  Touchez le cercle pour pointer une opération dès qu’elle passe sur votre compte.
                </Text>
              </>
            ) : null}

            {clearedTx.length > 0 ? (
              <>
                <SectionHeader title={`Pointées (${clearedTx.length})`} />
                <Card style={{ gap: spacing.md, paddingVertical: spacing.md }}>
                  {clearedTx.map(renderRow)}
                </Card>
              </>
            ) : null}
          </>
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
