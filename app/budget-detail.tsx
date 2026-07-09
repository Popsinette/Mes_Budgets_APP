import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteBudget,
  getBudgetForCategory,
  listBudgetExpenses,
} from '@/src/features/budgets/repository';
import {
  deleteTransaction,
  setTransactionCleared,
  type TransactionWithCategory,
} from '@/src/features/transactions/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel, monthPaceRatio, shortDayLabel } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

export default function BudgetDetailScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ categoryId?: string; month?: string }>();
  const categoryId = params.categoryId ? Number(params.categoryId) : null;
  const month = typeof params.month === 'string' && params.month ? params.month : currentMonthKey();

  const { data: budget } = useLiveQuery(
    (db) => (categoryId == null ? Promise.resolve(null) : getBudgetForCategory(db, categoryId, month)),
    [categoryId, month],
  );
  const { data: expenses } = useLiveQuery(
    (db) => (categoryId == null ? Promise.resolve([]) : listBudgetExpenses(db, categoryId, month)),
    [categoryId, month],
  );

  const items = expenses ?? [];
  const spent = budget?.spent_cents ?? 0;
  const allocated = budget?.amount_cents ?? 0;
  const remaining = allocated - spent;
  const ratio = allocated > 0 ? spent / allocated : 0;
  const over = ratio > 1;
  const barColor = over
    ? theme.colors.danger
    : ratio > 0.9
      ? theme.colors.warning
      : (budget?.category_color ?? theme.colors.text);

  const togglePointed = (t: TransactionWithCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setTransactionCleared(db, t.id, t.cleared === 0);
  };

  const confirmDeleteTx = (t: TransactionWithCategory) => {
    confirmAction({
      title: 'Supprimer l’opération',
      message: `Supprimer « ${t.label} » (${formatCents(t.amount_cents)}) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteTransaction(db, t.id),
    });
  };

  const editBudget = () => {
    if (!budget) return;
    router.replace({
      pathname: '/nouveau-budget',
      params: {
        month,
        categoryId: String(budget.category_id),
        amount: String(budget.amount_cents),
      },
    });
  };

  const confirmDeleteBudget = () => {
    if (!budget) return;
    confirmAction({
      title: 'Supprimer le budget',
      message: `Supprimer le budget « ${budget.category_name} » pour ce mois ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void deleteBudget(db, budget.id);
        router.back();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={budget?.category_name ?? 'Budget'} />
      <Caption>{monthKeyLabel(month)}</Caption>

      <Card style={{ gap: spacing.lg }}>
        <View style={styles.headerRow}>
          <CategoryIcon
            icon={budget?.category_icon ?? 'pricetag-outline'}
            color={budget?.category_color ?? theme.colors.textMuted}
            size={44}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
              <Money cents={spent} size={22} weight="bold" />
              <Caption>sur {formatCents(allocated)}</Caption>
            </View>
            <Caption tone={remaining >= 0 ? 'muted' : 'danger'}>
              {remaining >= 0
                ? `Reste ${formatCents(remaining)}`
                : `Dépassé de ${formatCents(-remaining)}`}
            </Caption>
          </View>
        </View>
        <ProgressBar ratio={ratio} color={barColor} height={11} markerRatio={monthPaceRatio(month)} />
        <View style={styles.actionsRow}>
          <Pressable
            onPress={editBudget}
            style={[styles.action, { backgroundColor: theme.colors.cardMuted }]}
          >
            <Ionicons name="create-outline" size={17} color={theme.colors.text} />
            <Body weight="semibold" size={14}>
              Modifier
            </Body>
          </Pressable>
          <Pressable
            onPress={confirmDeleteBudget}
            style={[styles.action, { backgroundColor: theme.colors.dangerSoft }]}
          >
            <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
            <Body weight="semibold" size={14} tone="danger">
              Supprimer
            </Body>
          </Pressable>
        </View>
      </Card>

      <SectionHeader title={`Dépenses · ${items.length}`} />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt-outline"
            title="Aucune dépense ce mois-ci"
            subtitle="Les dépenses de cette catégorie apparaîtront ici. Les prélèvements de factures ne sont pas comptés."
          />
        </Card>
      ) : (
        <Card style={{ gap: spacing.md, paddingVertical: spacing.md }}>
          {items.map((t) => {
            const isPending = t.cleared === 0;
            return (
              <View key={t.id} style={styles.txRow}>
                <Pressable hitSlop={8} onPress={() => togglePointed(t)}>
                  <Ionicons
                    name={isPending ? 'ellipse-outline' : 'checkmark-circle'}
                    size={23}
                    color={isPending ? theme.colors.textMuted : theme.colors.success}
                  />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Body weight="medium" numberOfLines={1}>
                    {t.label}
                  </Body>
                  <Caption numberOfLines={1}>
                    {shortDayLabel(t.date)}
                    {isPending ? ' · à venir' : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Money cents={-t.amount_cents} size={15} signed />
                  <Caption onPress={() => confirmDeleteTx(t)} style={{ fontSize: 11 }}>
                    Supprimer
                  </Caption>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <Caption style={{ textAlign: 'center' }}>
        Touchez le cercle pour pointer une dépense passée sur votre compte.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
