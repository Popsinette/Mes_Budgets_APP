import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { BarChart } from '@/src/components/charts/BarChart';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { DonutChart } from '@/src/components/charts/DonutChart';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getBillsSummary, listBillsForMonth } from '@/src/features/bills/repository';
import { listBudgetsWithSpending } from '@/src/features/budgets/repository';
import {
  getPlannedSavingsForMonth,
  getRealSavingsForMonth,
  getSavingsOverview,
} from '@/src/features/savings/repository';
import {
  getMonthlySeries,
  getMonthTotals,
  getSpendingByCategory,
  listTransactionsForMonth,
} from '@/src/features/transactions/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import {
  currentMonthKey,
  lastMonthKeys,
  monthKeyLabel,
  shortDayLabel,
  shortMonthLabel,
} from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function DashboardScreen() {
  const theme = useTheme();
  const month = currentMonthKey();

  const { data: totals } = useLiveQuery((db) => getMonthTotals(db, month), [month]);
  const { data: spending } = useLiveQuery((db) => getSpendingByCategory(db, month), [month]);
  const { data: budgets } = useLiveQuery((db) => listBudgetsWithSpending(db, month), [month]);
  const { data: bills } = useLiveQuery((db) => listBillsForMonth(db, month), [month]);
  const { data: billsSummary } = useLiveQuery((db) => getBillsSummary(db, month), [month]);
  const { data: savings } = useLiveQuery((db) => getSavingsOverview(db));
  const { data: plannedSavings } = useLiveQuery((db) => getPlannedSavingsForMonth(db, month), [month]);
  const { data: realSavings } = useLiveQuery((db) => getRealSavingsForMonth(db, month), [month]);
  const { data: transactions } = useLiveQuery((db) => listTransactionsForMonth(db, month), [month]);
  const { data: series } = useLiveQuery((db) => getMonthlySeries(db, lastMonthKeys(6)), [month]);

  const income = totals?.income_cents ?? 0;
  const expense = totals?.expense_cents ?? 0;
  const balance = income - expense;
  // Solde réel = opérations pointées uniquement (ce qui est passé sur le compte).
  const realBalance = (totals?.cleared_income_cents ?? 0) - (totals?.cleared_expense_cents ?? 0);
  const pendingCount = totals?.pending_count ?? 0;
  const monthLabel = monthKeyLabel(month);
  const upcomingBills = (bills ?? []).filter((b) => !b.paid_at).slice(0, 3);
  const topBudgets = (budgets ?? []).slice(0, 3);
  const recentTransactions = (transactions ?? []).slice(0, 4);

  // Reste à vivre prévisionnel : revenus − factures − budgets alloués − épargne prévue du mois
  const billsTotal = billsSummary?.total_cents ?? 0;
  const budgetsTotal = (budgets ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
  const savingsPlanned = plannedSavings ?? 0;
  const remainingToLive = income - billsTotal - budgetsTotal - savingsPlanned;
  // Reste à vivre réel : solde pointé du mois − épargne réellement virée ce mois
  const savingsReal = realSavings ?? 0;
  const remainingReal = realBalance - savingsReal;

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={80}>
        <View style={styles.headerRow}>
          <View style={{ gap: 2 }}>
            <Eyebrow>Bonjour</Eyebrow>
            <Title>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</Title>
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => router.push('/reglages')}
            style={[styles.gearButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <Ionicons name="settings-outline" size={19} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* Héros typographique : le montant porte la page, pas une carte en dégradé. */}
        <View style={styles.hero}>
          <Eyebrow>Solde réel · pointé</Eyebrow>
          <Money
            cents={realBalance}
            size={46}
            weight="xbold"
            tone={realBalance < 0 ? 'danger' : 'text'}
            style={{ marginTop: 2 }}
          />
          <View style={styles.heroMeta}>
            <View style={styles.heroStat}>
              <Caption>Prévisionnel</Caption>
              <Money cents={balance} size={16} weight="semibold" tone="muted" />
            </View>
            <View style={[styles.heroDivider, { backgroundColor: theme.colors.border }]} />
            <Pressable
              style={styles.heroStat}
              onPress={() => (pendingCount > 0 ? router.push('/operations') : undefined)}
            >
              <Caption>À venir</Caption>
              <Body weight="semibold" size={16} tone={pendingCount > 0 ? 'warning' : 'muted'}>
                {pendingCount > 0 ? `${pendingCount} opération${pendingCount > 1 ? 's' : ''}` : 'À jour'}
              </Body>
            </Pressable>
          </View>
        </View>

        <View style={styles.quickActions}>
          {(
            [
              ['Dépense', 'remove', 'expense', { pathname: '/nouvelle-transaction', params: { type: 'expense' } }],
              ['Revenu', 'add', 'income', { pathname: '/nouvelle-transaction', params: { type: 'income' } }],
              ['Épargner', 'trending-up', 'primary', '/epargne'],
            ] as const
          ).map(([label, icon, tone, target]) => {
            const color =
              tone === 'expense'
                ? theme.colors.expense
                : tone === 'income'
                  ? theme.colors.income
                  : theme.colors.text;
            return (
              <Pressable
                key={label}
                onPress={() => router.push(target as never)}
                style={[styles.quickAction, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
              >
                <Ionicons name={icon} size={18} color={color} />
                <Body weight="semibold" size={13.5}>
                  {label}
                </Body>
              </Pressable>
            );
          })}
        </View>

        <SectionHeader title="Reste à vivre" />
        <Card style={{ gap: spacing.lg }}>
          <View style={styles.rtvRow}>
            <View style={styles.rtvCol}>
              <Caption>Prévisionnel</Caption>
              <Money
                cents={remainingToLive}
                size={26}
                weight="bold"
                tone={remainingToLive < 0 ? 'danger' : 'text'}
              />
            </View>
            <View style={[styles.rtvDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.rtvCol}>
              <Caption>Réel à ce jour</Caption>
              <Money
                cents={remainingReal}
                size={26}
                weight="bold"
                tone={remainingReal < 0 ? 'danger' : 'success'}
              />
            </View>
          </View>

          {income === 0 ? (
            <Body tone="muted" size={13}>
              Ajoutez vos revenus du mois (bouton « Revenu ») pour un calcul complet.
            </Body>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            {(
              [
                ['Revenus du mois', income],
                ['Factures récurrentes', -billsTotal],
                ['Budgets alloués', -budgetsTotal],
                ['Épargne prévue', -savingsPlanned],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <View key={label} style={styles.breakdownRow}>
                <Body tone="muted" size={13.5}>
                  {label}
                </Body>
                <Money cents={value} size={13.5} weight="semibold" signed tone={value < 0 ? 'text' : 'success'} />
              </View>
            ))}
          </View>
        </Card>

        <SectionHeader title="Dépenses par catégorie" />
        <Card style={styles.donutCard}>
          {(spending ?? []).length === 0 ? (
            <EmptyState
              icon="pie-chart-outline"
              title="Aucune dépense ce mois-ci"
              subtitle="Ajoutez votre première transaction avec le bouton +"
            />
          ) : (
            <View style={styles.donutRow}>
              <DonutChart
                slices={(spending ?? []).map((s) => ({ value: s.spent_cents, color: s.category_color }))}
                centerLabel={formatCents(expense)}
                centerSubLabel="dépensés"
              />
              <View style={styles.legend}>
                {(spending ?? []).slice(0, 5).map((s) => {
                  const pct = expense > 0 ? Math.round((s.spent_cents / expense) * 100) : 0;
                  return (
                    <View key={String(s.category_id)} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: s.category_color }]} />
                      <Body size={13} numberOfLines={1} style={{ flex: 1 }}>
                        {s.category_name}
                      </Body>
                      <Caption color={s.category_color}>{pct} %</Caption>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </Card>

        <SectionHeader title="Évolution sur 6 mois" />
        <Card style={{ gap: spacing.md }}>
          {(series ?? []).every((p) => p.income_cents === 0 && p.expense_cents === 0) ? (
            <EmptyState
              icon="bar-chart-outline"
              title="Pas encore d'historique"
              subtitle="Le graphique se remplira au fil de vos opérations"
            />
          ) : (
            <>
              <BarChart
                groups={(series ?? []).map((point) => ({
                  label: shortMonthLabel(point.month),
                  bars: [
                    { value: point.income_cents, color: theme.colors.income },
                    { value: point.expense_cents, color: theme.colors.expense },
                  ],
                }))}
              />
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
                  <Caption>Revenus</Caption>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: theme.colors.expense }]} />
                  <Caption>Dépenses</Caption>
                </View>
              </View>
            </>
          )}
        </Card>

        <SectionHeader title="Budgets" actionLabel="Tout voir" onAction={() => router.push('/budgets')} />
        {topBudgets.length === 0 ? (
          <Card>
            <EmptyState
              icon="wallet-outline"
              title="Aucun budget défini"
              subtitle="Créez un budget par catégorie pour suivre vos dépenses"
            />
          </Card>
        ) : (
          topBudgets.map((budget) => {
            const ratio = budget.amount_cents > 0 ? budget.spent_cents / budget.amount_cents : 0;
            return (
              <Card key={budget.id} style={styles.budgetCard}>
                <View style={styles.budgetRow}>
                  <CategoryIcon icon={budget.category_icon} color={budget.category_color} size={36} />
                  <View style={styles.budgetInfo}>
                    <Body weight="semibold">{budget.category_name}</Body>
                    <Caption>
                      {formatCents(budget.spent_cents)} sur {formatCents(budget.amount_cents)}
                    </Caption>
                  </View>
                  <Body weight="semibold" size={13} tone={ratio > 1 ? 'danger' : 'muted'}>
                    {Math.round(ratio * 100)}%
                  </Body>
                </View>
                <ProgressBar ratio={ratio} color={ratio <= 0.85 ? budget.category_color : undefined} />
              </Card>
            );
          })
        )}

        <SectionHeader title="Factures à venir" actionLabel="Tout voir" onAction={() => router.push('/factures')} />
        {upcomingBills.length === 0 ? (
          <Card>
            <Body tone="muted" style={{ textAlign: 'center' }}>
              {billsSummary && billsSummary.total_cents > 0
                ? 'Toutes les factures du mois sont réglées ✓'
                : 'Aucune facture enregistrée'}
            </Body>
          </Card>
        ) : (
          <Card style={{ gap: spacing.md }}>
            {upcomingBills.map((bill) => (
              <View key={bill.id} style={styles.billRow}>
                <View style={[styles.billDay, { backgroundColor: theme.colors.cardMuted }]}>
                  <Body weight="bold" size={14}>
                    {bill.due_day}
                  </Body>
                </View>
                <Body weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                  {bill.name}
                </Body>
                <Money cents={bill.amount_cents} size={15} />
              </View>
            ))}
          </Card>
        )}

        <SectionHeader title="Épargne" actionLabel="Tout voir" onAction={() => router.push('/epargne')} />
        <Card style={styles.savingsCard}>
          <View style={[styles.savingsIcon, { backgroundColor: theme.colors.successSoft }]}>
            <Ionicons name="trending-up" size={20} color={theme.colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Money cents={savings?.total_real_cents ?? 0} size={22} weight="bold" />
            <Caption>épargnés au total sur vos comptes</Caption>
          </View>
        </Card>

        {recentTransactions.length > 0 ? (
          <>
            <SectionHeader
              title="Dernières opérations"
              actionLabel="Tout voir"
              onAction={() => router.push('/operations')}
            />
            <Card style={{ gap: spacing.md }}>
              {recentTransactions.map((t) => (
                <View key={t.id} style={styles.txRow}>
                  <CategoryIcon
                    icon={t.category_icon ?? 'pricetag-outline'}
                    color={t.category_color ?? theme.colors.textMuted}
                    size={36}
                  />
                  <View style={{ flex: 1 }}>
                    <Body weight="medium" numberOfLines={1}>
                      {t.label}
                    </Body>
                    <Caption>
                      {shortDayLabel(t.date)}
                      {t.cleared === 0 ? ' · à venir' : ''}
                    </Caption>
                  </View>
                  {t.cleared === 0 ? (
                    <Ionicons
                      name="hourglass-outline"
                      size={13}
                      color={theme.colors.warning}
                      style={{ marginRight: spacing.xs }}
                    />
                  ) : null}
                  <Money
                    cents={t.type === 'income' ? t.amount_cents : -t.amount_cents}
                    size={15}
                    signed
                    tone={t.type === 'income' ? 'income' : 'text'}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
      <FAB onPress={() => router.push('/nouvelle-transaction')} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  hero: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  heroStat: {
    gap: 2,
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  rtvRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rtvCol: {
    flex: 1,
    gap: 3,
  },
  rtvDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  donutCard: {
    paddingVertical: spacing.xl,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  legend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  budgetCard: {
    gap: spacing.md,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  budgetInfo: {
    flex: 1,
    gap: 1,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  billDay: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  savingsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
