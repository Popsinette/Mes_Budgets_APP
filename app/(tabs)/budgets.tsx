import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  copyBudgetsFromMonth,
  deleteBudget,
  listBudgetsWithSpending,
} from '@/src/features/budgets/repository';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthPaceRatio, shiftMonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function BudgetsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [month, setMonth] = useState(currentMonthKey());
  const { data: budgets } = useLiveQuery((db) => listBudgetsWithSpending(db, month), [month]);

  const totalBudget = (budgets ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
  const totalSpent = (budgets ?? []).reduce((sum, b) => sum + b.spent_cents, 0);
  const globalRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const pace = monthPaceRatio(month);

  const confirmDelete = (id: number, name: string) => {
    confirmAction({
      title: 'Supprimer le budget',
      message: `Supprimer le budget « ${name} » pour ce mois ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteBudget(db, id),
    });
  };

  const copyPreviousMonth = async () => {
    const copied = await copyBudgetsFromMonth(db, shiftMonthKey(month, -1), month);
    if (copied === 0) {
      notify('Rien à copier', 'Aucun budget du mois précédent à recopier.');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={80}>
        <Title>Budgets</Title>
        <MonthSwitcher month={month} onChange={setMonth} />

        {(budgets ?? []).length > 0 ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.totalRow}>
              <View style={{ gap: 3 }}>
                <Eyebrow>Dépensé ce mois</Eyebrow>
                <Money cents={totalSpent} size={24} weight="bold" />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Eyebrow>Enveloppe</Eyebrow>
                <Money cents={totalBudget} size={16} weight="semibold" tone="muted" />
              </View>
            </View>
            <ProgressBar
              ratio={globalRatio}
              height={11}
              markerRatio={pace}
              color={
                globalRatio > 1
                  ? theme.colors.danger
                  : globalRatio > 0.9
                    ? theme.colors.warning
                    : theme.colors.success
              }
            />
            <View style={styles.metaRow}>
              <Caption tone={globalRatio > 1 ? 'danger' : 'muted'}>
                {globalRatio > 1
                  ? `Dépassement de ${formatCents(totalSpent - totalBudget)}`
                  : `Reste ${formatCents(totalBudget - totalSpent)} disponible`}
              </Caption>
              {pace != null ? (
                <Caption>
                  {'▏'} rythme · jour {new Date().getDate()}
                </Caption>
              ) : null}
            </View>
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
            const over = ratio > 1;
            const barColor = over
              ? theme.colors.danger
              : ratio > 0.9
                ? theme.colors.warning
                : budget.category_color;
            return (
              <Card
                key={budget.id}
                style={{ gap: spacing.md }}
                onPress={() =>
                  router.push({
                    pathname: '/budget-detail',
                    params: { month, categoryId: String(budget.category_id) },
                  })
                }
                onLongPress={() => confirmDelete(budget.id, budget.category_name)}
              >
                <View style={styles.budgetRow}>
                  <CategoryIcon icon={budget.category_icon} color={budget.category_color} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Body weight="semibold">{budget.category_name}</Body>
                    <Caption tone={remaining >= 0 ? 'muted' : 'danger'}>
                      {remaining >= 0
                        ? `Reste ${formatCents(remaining)}`
                        : `Dépassé de ${formatCents(-remaining)}`}
                    </Caption>
                  </View>
                  <View style={styles.pct}>
                    <View
                      style={[
                        styles.pctPill,
                        {
                          backgroundColor: over ? theme.colors.dangerSoft : theme.colors.cardMuted,
                        },
                      ]}
                    >
                      <Body weight="semibold" size={12} tone={over ? 'danger' : 'muted'}>
                        {Math.round(ratio * 100)}%
                      </Body>
                    </View>
                    <Money cents={budget.spent_cents} size={15} weight="bold" />
                  </View>
                </View>
                <ProgressBar ratio={ratio} color={barColor} markerRatio={pace} />
              </Card>
            );
          })
        )}

        <Caption style={{ textAlign: 'center' }}>
          Touchez un budget pour voir ses dépenses · appui long pour le supprimer
        </Caption>
      </Screen>
      <FAB onPress={() => router.push({ pathname: '/nouveau-budget', params: { month } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pct: {
    alignItems: 'flex-end',
    gap: 4,
  },
  pctPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
});
