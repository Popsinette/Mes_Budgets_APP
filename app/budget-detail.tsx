import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
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
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel, shortDayLabel } from '@/src/utils/dates';
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
      <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>{monthKeyLabel(month)}</Text>

      <Card style={{ gap: spacing.md }}>
        <View style={styles.headerRow}>
          <CategoryIcon
            icon={budget?.category_icon ?? 'pricetag-outline'}
            color={budget?.category_color ?? theme.colors.primary}
            size={44}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.spentValue, { color: theme.colors.text }]}>
              {formatCents(spent)}{' '}
              <Text style={{ color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' }}>
                / {formatCents(allocated)}
              </Text>
            </Text>
            <Text
              style={{
                color: remaining >= 0 ? theme.colors.textMuted : theme.colors.danger,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {remaining >= 0
                ? `Reste ${formatCents(remaining)}`
                : `Dépassé de ${formatCents(-remaining)}`}
            </Text>
          </View>
        </View>
        <ProgressBar
          ratio={ratio}
          color={ratio <= 0.85 ? (budget?.category_color ?? theme.colors.primary) : undefined}
          height={10}
        />
        <View style={styles.actionsRow}>
          <Pressable
            onPress={editBudget}
            style={[styles.action, { backgroundColor: theme.colors.cardMuted }]}
          >
            <Ionicons name="create-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.actionLabel, { color: theme.colors.text }]}>Modifier</Text>
          </Pressable>
          <Pressable
            onPress={confirmDeleteBudget}
            style={[styles.action, { backgroundColor: theme.colors.dangerSoft }]}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.actionLabel, { color: theme.colors.danger }]}>Supprimer</Text>
          </Pressable>
        </View>
      </Card>

      <SectionHeader title={`Dépenses (${items.length})`} />

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
                    size={24}
                    color={isPending ? theme.colors.textMuted : theme.colors.success}
                  />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txLabel, { color: theme.colors.text }]} numberOfLines={1}>
                    {t.label}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                    {shortDayLabel(t.date)}
                    {isPending ? ' · à venir' : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={[styles.txAmount, { color: theme.colors.text }]}>
                    {formatCents(-t.amount_cents, { signed: true })}
                  </Text>
                  <Text
                    onPress={() => confirmDeleteTx(t)}
                    style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' }}
                  >
                    Supprimer
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' }}>
        Touchez le cercle pour pointer une dépense passée sur votre compte.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  spentValue: {
    fontSize: 22,
    fontWeight: '800',
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
    borderRadius: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
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
