import { router } from 'expo-router';
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
import { getBillsSummary } from '@/src/features/bills/repository';
import {
  copyBudgetsFromMonth,
  deleteBudget,
  listBudgetsWithSpending,
} from '@/src/features/budgets/repository';
import { getPlannedSavingsForMonth } from '@/src/features/savings/repository';
import { getMonthTotals } from '@/src/features/transactions/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthPaceRatio, shiftMonthKey } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function BudgetsScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const { data: budgets } = useLiveQuery((db) => listBudgetsWithSpending(db, month), [month]);
  const { data: totals } = useLiveQuery((db) => getMonthTotals(db, month), [month]);
  const { data: billsSummary } = useLiveQuery((db) => getBillsSummary(db, month), [month]);
  const { data: plannedSavings } = useLiveQuery((db) => getPlannedSavingsForMonth(db, month), [month]);

  const totalBudget = (budgets ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
  const totalSpent = (budgets ?? []).reduce((sum, b) => sum + b.spent_cents, 0);
  const globalRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const pace = monthPaceRatio(month);

  // Reste à allouer (prévisionnel) : ce que les revenus du mois — y compris
  // ceux « à venir » — laissent une fois factures, épargne prévue et budgets posés.
  const income = totals?.income_cents ?? 0;
  const pendingIncome = income - (totals?.cleared_income_cents ?? 0);
  const billsTotal = billsSummary?.total_cents ?? 0;
  const savingsPlanned = plannedSavings ?? 0;
  const leftToAllocate = income - billsTotal - savingsPlanned - totalBudget;

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

        <SectionHeader title="Reste à allouer" />
        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <Money
              cents={leftToAllocate}
              size={28}
              weight="bold"
              tone={leftToAllocate < 0 ? 'danger' : 'text'}
            />
            <Caption>
              {leftToAllocate < 0
                ? 'Vos budgets dépassent ce que les revenus du mois permettent.'
                : 'disponible pour de nouveaux budgets ce mois-ci'}
            </Caption>
          </View>
          <View style={{ gap: spacing.sm }}>
            <View style={styles.allocRow}>
              <Body tone="muted" size={13.5}>
                Revenus du mois{pendingIncome > 0 ? ` (dont ${formatCents(pendingIncome)} à venir)` : ''}
              </Body>
              <Money cents={income} size={13.5} weight="semibold" signed tone="success" />
            </View>
            {(
              [
                ['Factures récurrentes', -billsTotal],
                ['Épargne prévue', -savingsPlanned],
                ['Budgets alloués', -totalBudget],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <View key={label} style={styles.allocRow}>
                <Body tone="muted" size={13.5}>
                  {label}
                </Body>
                <Money cents={value} size={13.5} weight="semibold" signed />
              </View>
            ))}
          </View>
          {income === 0 ? (
            <Caption>
              Ajoutez vos revenus — même « à venir » — depuis l'accueil pour un calcul complet.
            </Caption>
          ) : null}
        </Card>

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
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
