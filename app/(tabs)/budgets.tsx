import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  copyBudgetsFromMonth,
  deleteBudget,
  listBudgetsWithSpending,
} from '@/src/features/budgets/repository';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, shiftMonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function BudgetsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [month, setMonth] = useState(currentMonthKey());
  const { data: budgets } = useLiveQuery((db) => listBudgetsWithSpending(db, month), [month]);

  const totalBudget = (budgets ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
  const totalSpent = (budgets ?? []).reduce((sum, b) => sum + b.spent_cents, 0);
  const globalRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;

  const confirmDelete = (id: number, name: string) => {
    Alert.alert('Supprimer le budget', `Supprimer le budget « ${name} » pour ce mois ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => void deleteBudget(db, id) },
    ]);
  };

  const copyPreviousMonth = async () => {
    const copied = await copyBudgetsFromMonth(db, shiftMonthKey(month, -1), month);
    if (copied === 0) {
      Alert.alert('Rien à copier', 'Aucun budget du mois précédent à recopier.');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={72}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Budgets</Text>
        <MonthSwitcher month={month} onChange={setMonth} />

        {(budgets ?? []).length > 0 ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>Total du mois</Text>
              <Text style={[styles.totalValue, { color: theme.colors.text }]}>
                {formatCents(totalSpent)}{' '}
                <Text style={{ color: theme.colors.textMuted, fontWeight: '600' }}>
                  / {formatCents(totalBudget)}
                </Text>
              </Text>
            </View>
            <ProgressBar ratio={globalRatio} height={10} />
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              {globalRatio > 1
                ? `Dépassement de ${formatCents(totalSpent - totalBudget)}`
                : `Reste ${formatCents(totalBudget - totalSpent)} disponible`}
            </Text>
          </Card>
        ) : null}

        <SectionHeader
          title="Par catégorie"
          actionLabel="Copier le mois précédent"
          onAction={() => void copyPreviousMonth()}
        />

        {(budgets ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon="wallet-outline"
              title="Aucun budget pour ce mois"
              subtitle="Ajoutez un budget par catégorie avec le bouton +, ou recopiez ceux du mois précédent."
            />
          </Card>
        ) : (
          (budgets ?? []).map((budget) => {
            const ratio = budget.amount_cents > 0 ? budget.spent_cents / budget.amount_cents : 0;
            const remaining = budget.amount_cents - budget.spent_cents;
            return (
              <Card
                key={budget.id}
                style={{ gap: spacing.md }}
                onLongPress={() => confirmDelete(budget.id, budget.category_name)}
              >
                <View style={styles.budgetRow}>
                  <CategoryIcon icon={budget.category_icon} color={budget.category_color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.budgetName, { color: theme.colors.text }]}>
                      {budget.category_name}
                    </Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                      {remaining >= 0
                        ? `Reste ${formatCents(remaining)}`
                        : `Dépassé de ${formatCents(-remaining)}`}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.budgetSpent, { color: theme.colors.text }]}>
                      {formatCents(budget.spent_cents)}
                    </Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                      sur {formatCents(budget.amount_cents)}
                    </Text>
                  </View>
                </View>
                <ProgressBar ratio={ratio} color={ratio <= 0.85 ? budget.category_color : undefined} />
              </Card>
            );
          })
        )}

        <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: 'center' }}>
          Appui long sur un budget pour le supprimer
        </Text>
      </Screen>
      <FAB onPress={() => router.push({ pathname: '/nouveau-budget', params: { month } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  budgetName: {
    fontSize: 16,
    fontWeight: '700',
  },
  budgetSpent: {
    fontSize: 16,
    fontWeight: '800',
  },
});
