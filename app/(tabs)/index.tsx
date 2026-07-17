import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { BarChart } from '@/src/components/charts/BarChart';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { DonutChart } from '@/src/components/charts/DonutChart';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
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
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import {
  currentMonthKey,
  lastMonthKeys,
  monthKeyLabel,
  monthPaceRatio,
  shortDayLabel,
  shortMonthLabel,
} from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

export default function DashboardScreen() {
  const theme = useTheme();
  // Mois global : le sélecteur ci-dessous pilote tous les écrans de l'app.
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);

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
  const pendingCount = totals?.pending_count ?? 0;
  const monthLabel = monthKeyLabel(month);
  const upcomingBills = (bills ?? []).filter((b) => !b.paid_at).slice(0, 3);
  const topBudgets = (budgets ?? []).slice(0, 3);
  const recentTransactions = (transactions ?? []).slice(0, 4);

  const billsTotal = billsSummary?.total_cents ?? 0;
  const unpaidBillsTotal = billsTotal - (billsSummary?.paid_cents ?? 0);
  const budgetsTotal = (budgets ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
  const savingsPlanned = plannedSavings ?? 0; // tous les virements du mois (dépôts +, retraits −)
  const savingsReal = realSavings ?? 0; // virements cochés « effectués » uniquement

  // Solde réel « pointé » = ce qui est réellement passé sur le compte courant :
  // opérations pointées, moins l'épargne réellement virée (un retrait, négatif, s'y rajoute).
  const realBalance =
    (totals?.cleared_income_cents ?? 0) - (totals?.cleared_expense_cents ?? 0) - savingsReal;
  // Solde prévisionnel = projection fin de mois : toutes les opérations saisies,
  // moins les factures restant à payer et toute l'épargne du mois (faite + prévue).
  const balance = income - expense - unpaidBillsTotal - savingsPlanned;

  // Reste à vivre prévisionnel : revenus − factures − budgets alloués − épargne prévue du mois.
  // (Le « reste à vivre réel » est le solde réel pointé, affiché en héros — pas de doublon.)
  const remainingToLive = income - billsTotal - budgetsTotal - savingsPlanned;

  // Les deux prévisionnels ne mesurent pas la même chose : le « fin de mois »
  // suit les dépenses libres réellement saisies, le « reste à vivre » suppose
  // les budgets dépensés à l'euro près. Leur écart = budgets alloués − dépenses
  // libres déjà saisies (les dépenses de factures sont hors budgets).
  const freeExpense = expense - (billsSummary?.paid_cents ?? 0);
  const planGap = budgetsTotal - freeExpense;

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
            accessibilityRole="button"
            accessibilityLabel="Réglages"
            style={[styles.gearButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <Ionicons name="settings-outline" size={19} color={theme.colors.text} />
          </Pressable>
        </View>

        <MonthSwitcher month={month} onChange={setMonth} />

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
              <Caption>Prévisionnel fin de mois</Caption>
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

        <SectionHeader title="Reste à vivre prévisionnel" />
        <Card style={{ gap: spacing.lg }}>
          <View style={styles.rtvRow}>
            <View style={styles.rtvCol}>
              <Money
                cents={remainingToLive}
                size={30}
                weight="bold"
                tone={remainingToLive < 0 ? 'danger' : 'text'}
              />
              <Caption>
                si vous tenez vos budgets — factures, budgets alloués et épargne mis de côté
              </Caption>
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

          {/* Pont vers l'autre prévisionnel : le même chiffre que le héros,
              avec la raison de l'écart — les deux ne mesurent pas la même chose. */}
          <View style={[styles.compareBox, { borderTopColor: theme.colors.hairline }]}>
            <View style={styles.breakdownRow}>
              <Body tone="muted" size={13.5}>
                Prévisionnel fin de mois
              </Body>
              <Money cents={balance} size={13.5} weight="semibold" />
            </View>
            <Caption>
              {planGap === 0
                ? 'Identique au reste à vivre : vos dépenses libres égalent exactement vos budgets.'
                : planGap > 0
                  ? `Suit vos opérations saisies, pas les budgets : il reste ${formatCents(planGap)} à dépenser sur vos budgets, d'où l'écart.`
                  : `Suit vos opérations saisies, pas les budgets : vos dépenses libres dépassent les budgets alloués de ${formatCents(-planGap)}, d'où l'écart.`}
            </Caption>
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
                      {/* Le texte reste en encre : la pastille porte l'identité, pas le chiffre. */}
                      <Caption style={styles.legendPct}>{pct} %</Caption>
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
            const over = ratio > 1;
            const barColor = over
              ? theme.colors.danger
              : ratio > 0.9
                ? theme.colors.warning
                : budget.category_color;
            return (
              <Card key={budget.id} style={styles.budgetCard}>
                <View style={styles.budgetRow}>
                  <CategoryIcon icon={budget.category_icon} color={budget.category_color} size={36} />
                  <View style={styles.budgetInfo}>
                    <Body weight="semibold">{budget.category_name}</Body>
                    <Caption tone={over ? 'danger' : 'muted'}>
                      {over
                        ? `Dépassé de ${formatCents(budget.spent_cents - budget.amount_cents)}`
                        : `Reste ${formatCents(budget.amount_cents - budget.spent_cents)} sur ${formatCents(budget.amount_cents)}`}
                    </Caption>
                  </View>
                  <Body weight="semibold" size={13} tone={over ? 'danger' : 'muted'}>
                    {Math.round(ratio * 100)}%
                  </Body>
                </View>
                <ProgressBar ratio={ratio} color={barColor} markerRatio={monthPaceRatio(month)} />
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
  compareBox: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.xs,
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
  legendPct: {
    width: 38,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
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
