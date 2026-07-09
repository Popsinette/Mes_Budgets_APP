import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BarChart } from '@/src/components/charts/BarChart';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { DonutChart } from '@/src/components/charts/DonutChart';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
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
      <Screen bottomInset={72}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.hello, { color: theme.colors.textMuted }]}>Bonjour 👋</Text>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            </Text>
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => router.push('/reglages')}
            style={[styles.gearButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
          </Pressable>
        </View>

        <LinearGradient
          colors={theme.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Solde réel (pointé)</Text>
          <Text style={styles.balanceValue}>{formatCents(realBalance)}</Text>
          {pendingCount > 0 ? (
            <Pressable style={styles.pendingPill} onPress={() => router.push('/operations')}>
              <Ionicons name="hourglass-outline" size={14} color="#FFFFFF" />
              <Text style={styles.pendingText}>
                {pendingCount} à venir · {formatCents(balance)} prévu
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Ionicons name="arrow-down-circle" size={18} color="#B9F6D3" />
              <Text style={styles.balanceItemText}>{formatCents(income)}</Text>
            </View>
            <View style={styles.balanceItem}>
              <Ionicons name="arrow-up-circle" size={18} color="#FFD1D1" />
              <Text style={styles.balanceItemText}>{formatCents(expense)}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.quickActions}>
          <Pressable
            onPress={() => router.push({ pathname: '/nouvelle-transaction', params: { type: 'expense' } })}
            style={[styles.quickAction, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.dangerSoft }]}>
              <Ionicons name="remove" size={18} color={theme.colors.danger} />
            </View>
            <Text style={[styles.quickActionLabel, { color: theme.colors.text }]}>Dépense</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/nouvelle-transaction', params: { type: 'income' } })}
            style={[styles.quickAction, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.successSoft }]}>
              <Ionicons name="add" size={18} color={theme.colors.success} />
            </View>
            <Text style={[styles.quickActionLabel, { color: theme.colors.text }]}>Revenu</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/epargne')}
            style={[styles.quickAction, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name="trending-up" size={18} color={theme.colors.primary} />
            </View>
            <Text style={[styles.quickActionLabel, { color: theme.colors.text }]}>Épargner</Text>
          </Pressable>
        </View>

        <SectionHeader title="Reste à vivre" />
        <Card style={{ gap: spacing.md }}>
          <View style={styles.rtvRow}>
            <View style={styles.rtvCol}>
              <Text style={[styles.rtvColLabel, { color: theme.colors.textMuted }]}>Prévisionnel</Text>
              <Text
                style={[
                  styles.remainingValue,
                  { color: remainingToLive < 0 ? theme.colors.danger : theme.colors.text },
                ]}
              >
                {formatCents(remainingToLive)}
              </Text>
            </View>
            <View style={[styles.rtvDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.rtvCol}>
              <Text style={[styles.rtvColLabel, { color: theme.colors.textMuted }]}>Réel à ce jour</Text>
              <Text
                style={[
                  styles.remainingValue,
                  { color: remainingReal < 0 ? theme.colors.danger : theme.colors.success },
                ]}
              >
                {formatCents(remainingReal)}
              </Text>
            </View>
          </View>

          {income === 0 ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              Ajoutez vos revenus du mois (bouton « Revenu ») pour un calcul complet.
            </Text>
          ) : null}

          <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
            {(
              [
                ['Revenus du mois', income, theme.colors.success],
                ['Factures récurrentes', -billsTotal, theme.colors.text],
                ['Budgets alloués', -budgetsTotal, theme.colors.text],
                ['Épargne prévue', -savingsPlanned, theme.colors.text],
              ] as Array<[string, number, string]>
            ).map(([label, value, color]) => (
              <View key={label} style={styles.remainingRow}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{label}</Text>
                <Text style={{ color, fontSize: 13, fontWeight: '700' }}>
                  {formatCents(value, { signed: true })}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 }}>
            Prévisionnel = revenus − factures − budgets − épargne prévue. Réel = solde du mois − épargne
            réellement virée.
          </Text>
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
                      <Text style={[styles.legendName, { color: theme.colors.text }]} numberOfLines={1}>
                        {s.category_name}
                      </Text>
                      <Text style={[styles.legendValue, { color: s.category_color }]}>{pct} %</Text>
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
                    { value: point.expense_cents, color: theme.colors.primary },
                  ],
                }))}
              />
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                    Revenus
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                    Dépenses
                  </Text>
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
                    <Text style={[styles.budgetName, { color: theme.colors.text }]}>{budget.category_name}</Text>
                    <Text style={[styles.budgetAmounts, { color: theme.colors.textMuted }]}>
                      {formatCents(budget.spent_cents)} / {formatCents(budget.amount_cents)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.budgetPercent,
                      { color: ratio > 1 ? theme.colors.danger : theme.colors.textMuted },
                    ]}
                  >
                    {Math.round(ratio * 100)}%
                  </Text>
                </View>
                <ProgressBar ratio={ratio} color={ratio <= 0.85 ? budget.category_color : undefined} />
              </Card>
            );
          })
        )}

        <SectionHeader title="Factures à venir" actionLabel="Tout voir" onAction={() => router.push('/factures')} />
        {upcomingBills.length === 0 ? (
          <Card>
            <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
              {billsSummary && billsSummary.total_cents > 0
                ? 'Toutes les factures du mois sont réglées ✅'
                : 'Aucune facture enregistrée'}
            </Text>
          </Card>
        ) : (
          <Card style={{ gap: spacing.md }}>
            {upcomingBills.map((bill) => (
              <View key={bill.id} style={styles.billRow}>
                <View style={[styles.billDay, { backgroundColor: theme.colors.warningSoft }]}>
                  <Text style={[styles.billDayText, { color: theme.colors.warning }]}>{bill.due_day}</Text>
                </View>
                <Text style={[styles.billName, { color: theme.colors.text }]} numberOfLines={1}>
                  {bill.name}
                </Text>
                <Text style={[styles.billAmount, { color: theme.colors.text }]}>
                  {formatCents(bill.amount_cents)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <SectionHeader title="Épargne" actionLabel="Tout voir" onAction={() => router.push('/epargne')} />
        <Card style={styles.savingsCard}>
          <View style={[styles.savingsIcon, { backgroundColor: theme.colors.successSoft }]}>
            <Ionicons name="trending-up" size={22} color={theme.colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.savingsValue, { color: theme.colors.text }]}>
              {formatCents(savings?.total_real_cents ?? 0)}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
              épargnés au total sur vos comptes
            </Text>
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
                    color={t.category_color ?? theme.colors.primary}
                    size={36}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txLabel, { color: theme.colors.text }]} numberOfLines={1}>
                      {t.label}
                    </Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                      {shortDayLabel(t.date)}
                      {t.cleared === 0 ? ' · à venir' : ''}
                    </Text>
                  </View>
                  {t.cleared === 0 ? (
                    <Ionicons
                      name="hourglass-outline"
                      size={14}
                      color={theme.colors.textMuted}
                      style={{ marginRight: spacing.xs }}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.txAmount,
                      { color: t.type === 'income' ? theme.colors.income : theme.colors.text },
                    ]}
                  >
                    {formatCents(t.type === 'income' ? t.amount_cents : -t.amount_cents, { signed: true })}
                  </Text>
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
  hello: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  balanceCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: spacing.xs,
  },
  pendingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceItemText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  remainingValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  remainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rtvRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rtvCol: {
    flex: 1,
    gap: 2,
  },
  rtvColLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rtvDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
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
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  budgetName: {
    fontSize: 15,
    fontWeight: '700',
  },
  budgetAmounts: {
    fontSize: 13,
  },
  budgetPercent: {
    fontSize: 14,
    fontWeight: '700',
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  billDay: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billDayText: {
    fontSize: 14,
    fontWeight: '800',
  },
  billName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  billAmount: {
    fontSize: 15,
    fontWeight: '700',
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
  savingsValue: {
    fontSize: 20,
    fontWeight: '800',
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
