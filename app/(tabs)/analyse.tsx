import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChartLegend, ColumnChart } from '@/src/components/charts/ColumnChart';
import { HBars } from '@/src/components/charts/HBars';
import { FlowChart } from '@/src/components/charts/FlowChart';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Segmented } from '@/src/components/ui/Segmented';
import { LineChart, type LinePoint } from '@/src/components/charts/LineChart';
import { InsightsCard } from '@/src/components/InsightsCard';
import { AppHeader } from '@/src/components/ui/AppHeader';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow, Heading, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getMoneyFlowDetail, getTopExpenses, getTrend, getWeeklySpending, moneyFlowOf } from '@/src/features/analytics/repository';
import { closeWeek, isWeekClosed, listEnvelopesForMonth, listEnvelopesForWeek } from '@/src/features/envelopes/repository';
import { listPots } from '@/src/features/savings/repository';
import { getBalanceHistory, getMonthSummary, SPENDING_GROUPS, type SpendingGroup } from '@/src/features/summary/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import {
  currentMonthKey,
  currentWeekKey,
  daysInMonthOf,
  monthOfWeek,
  numericDate,
  shiftMonthKey,
  shiftWeekKey,
  shortMonthLabel,
  todayIso,
  weeksOfMonth,
  type MonthKey,
} from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

const PROJECTION_MONTHS = 6;

type Section = 'mois' | 'tendances' | 'epargne';

const SECTIONS: Array<{ key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'mois', label: 'Ce mois', icon: 'pie-chart-outline' },
  { key: 'tendances', label: 'Tendances', icon: 'bar-chart-outline' },
  { key: 'epargne', label: 'Épargne', icon: 'leaf-outline' },
];

export default function AnalysisScreen() {
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const [section, setSection] = useState<Section>('mois');
  return (
    <Screen bottomInset={90}>
      <AppHeader title="Où va mon argent" />
      <MonthSwitcher month={month} onChange={setMonth} />
      <Segmented segments={SECTIONS} value={section} onChange={setSection} />
      {section === 'mois' ? <MonthSection month={month} /> : null}
      {section === 'tendances' ? <TrendSection month={month} /> : null}
      {section === 'epargne' ? <SavingsSection month={month} /> : null}
    </Screen>
  );
}

/** Part du mois écoulée (0..1) : 1 pour un mois passé, 0 pour un mois à venir. */
function elapsedRatio(month: MonthKey): number {
  const current = currentMonthKey();
  if (month < current) return 1;
  if (month > current) return 0;
  return new Date().getDate() / daysInMonthOf(month);
}

/* ─────────────── Ce mois ─────────────── */

function MonthSection({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const { data } = useLiveQuery(
    async (db) => {
      const summary = await getMonthSummary(db, month);
      const [envelopes, weeks, top, detail] = await Promise.all([
        listEnvelopesForMonth(db, month, currentWeekKey()),
        getWeeklySpending(db, month),
        getTopExpenses(db, month, 5),
        getMoneyFlowDetail(db, month),
      ]);
      return { summary, flow: moneyFlowOf(summary), envelopes, weeks, top, detail };
    },
    [month],
  );
  if (!data) return null;
  const { summary, flow, envelopes, weeks, top, detail } = data;
  const elapsed = elapsedRatio(month);
  const days = daysInMonthOf(month);
  const daysPassed = Math.max(1, Math.round(elapsed * days));
  const daysLeft = Math.max(1, days - daysPassed + 1);
  const variableSpent = summary.variables_spent_cents + summary.postes_spent_cents;
  const variableBudget = summary.variables_budget_cents + summary.postes_budget_cents;
  const variableLeft = Math.max(0, variableBudget - variableSpent);
  const income = summary.income_cents;
  const isCurrent = month === currentMonthKey();
  const sorted = [...envelopes]
    .filter((e) => e.budget_cents > 0 || e.spent_cents > 0)
    .sort((a, b) => b.spent_cents / Math.max(1, b.budget_cents) - a.spent_cents / Math.max(1, a.budget_cents));

  return (
    <>
      <InsightsCard month={month} />

      <View style={styles.tiles}>
        <StatTile
          icon="calendar-outline"
          label="Dépensé par jour"
          value={formatCents(elapsed > 0 ? Math.round(variableSpent / daysPassed) : 0)}
          hint="en variables, en moyenne"
          color={theme.colors.primary}
        />
        {isCurrent ? (
          <StatTile
            icon="hourglass-outline"
            label="Possible par jour"
            value={formatCents(Math.round(variableLeft / daysLeft))}
            hint={`d’ici la fin du mois (${daysLeft} j)`}
            color={theme.colors.secondary}
          />
        ) : (
          <StatTile
            icon="wallet-outline"
            label="Économies du mois"
            value={formatCents(summary.balance_cents, { signed: true })}
            hint="revenus − dépenses"
            color={theme.colors.secondary}
          />
        )}
        <StatTile
          icon="receipt-outline"
          label="Factures"
          value={`${pct(summary.charges_cents, income)} %`}
          hint="de tes revenus"
          color={theme.colors.navy}
        />
        <StatTile
          icon="leaf-outline"
          label="Épargne prévue"
          value={`${pct(summary.savings_planned_cents, income)} %`}
          hint="de tes revenus"
          color={theme.colors.rose}
        />
      </View>

      <Card style={{ gap: spacing.md }}>
        <View>
          <Heading>Où va mon argent</Heading>
          <Caption>
            {income > 0
              ? `Sur ${formatCents(income)} de revenus ce mois-ci`
              : 'Ajoute tes revenus pour voir comment ils se répartissent.'}
          </Caption>
        </View>
        {detail.families.length > 0 ? <FlowChart detail={detail} /> : null}
        {flow.over_cents > 0 ? (
          <View style={[styles.alert, { backgroundColor: theme.colors.dangerSoft }]}>
            <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
            <Body size={13.5} color={theme.colors.danger} style={{ flex: 1 }}>
              Tes dépenses et ton épargne dépassent tes revenus de {formatCents(flow.over_cents)}.
            </Body>
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <View>
          <Heading>Mes enveloppes</Heading>
          <Caption>
            Dépensé face au prévu{isCurrent ? ' · le trait montre où tu devrais en être aujourd’hui' : ''}
          </Caption>
        </View>
        {sorted.length === 0 ? (
          <Caption>Aucune enveloppe avec un montant ce mois-ci.</Caption>
        ) : (
          sorted.map((e) => {
            const left = e.budget_cents - e.spent_cents;
            return (
              <View key={e.id} style={{ gap: 6 }}>
                <View style={styles.envHead}>
                  <CategoryIcon icon={e.icon} color={e.color} size={28} />
                  <Body size={14} weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                    {e.name}
                  </Body>
                  <Body size={13.5}>
                    <Body size={13.5} weight="bold">
                      {formatCents(e.spent_cents)}
                    </Body>
                    {` / ${formatCents(e.budget_cents)}`}
                  </Body>
                </View>
                <ProgressBar
                  ratio={e.budget_cents > 0 ? e.spent_cents / e.budget_cents : e.spent_cents > 0 ? 2 : 0}
                  color={e.spent_cents > e.budget_cents ? theme.colors.danger : e.color}
                  height={7}
                  markerRatio={isCurrent ? elapsed : undefined}
                />
                <Caption tone={left < 0 ? 'danger' : 'muted'}>
                  {left < 0 ? `Dépassé de ${formatCents(-left)}` : `Reste ${formatCents(left)}`}
                </Caption>
              </View>
            );
          })
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <View>
          <Heading>Semaine après semaine</Heading>
          <Caption>Enveloppes de la semaine : dépensé chaque semaine du mois</Caption>
        </View>
        <ColumnChart
          columns={weeks.map((w, i) => ({
            key: w.week,
            label: `S${i + 1}`,
            segments: [{ key: 'spent', label: `Semaine du ${numericDate(w.week).slice(0, 5)}`, cents: w.spent_cents, color: SPENDING_GROUPS.variables.color }],
            reference: w.budget_cents || undefined,
          }))}
          referenceLabel="Budget d’une semaine"
          emptyLabel="Aucune dépense de la semaine ce mois-ci."
        />
        {weeks.some((w) => w.budget_cents > 0) ? <ChartLegend items={[]} reference="budget d’une semaine" /> : null}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Heading>Mes plus grosses dépenses</Heading>
        {top.length === 0 ? (
          <Caption>Aucune dépense ce mois-ci.</Caption>
        ) : (
          top.map((x, i) => (
            <Pressable
              key={x.id}
              onPress={() => router.push({ pathname: '/depense', params: { id: String(x.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`${x.label}, ${formatCents(x.amount_cents)}`}
              style={({ pressed }) => [styles.topRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Caption style={styles.rank}>{i + 1}</Caption>
              <CategoryIcon icon={x.envelope_icon} color={x.envelope_color} size={32} />
              <View style={{ flex: 1 }}>
                <Body size={14} weight="medium" numberOfLines={1}>
                  {x.label}
                </Body>
                <Caption numberOfLines={1}>
                  {x.envelope_name} · {numericDate(x.date)}
                </Caption>
              </View>
              <Money cents={x.amount_cents} size={14.5} weight="semibold" />
              <Caption style={styles.pctCol}>{pct(x.amount_cents, summary.expense_cents)} %</Caption>
            </Pressable>
          ))
        )}
        {top.length > 0 ? <Caption>% = part de toutes tes dépenses du mois.</Caption> : null}
      </Card>

      <View style={styles.row}>
        <RhythmCard month={month} />
        <WeekClosingCard />
      </View>
    </>
  );
}

function RhythmCard({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const { data: summary } = useLiveQuery((db) => getMonthSummary(db, month), [month]);
  const elapsed = Math.round(elapsedRatio(month) * 100);
  const budget = summary?.variables_budget_cents ?? 0;
  const spentPct = budget > 0 ? Math.round(((summary?.variables_spent_cents ?? 0) / budget) * 100) : 0;
  const isCurrent = month === currentMonthKey();
  return (
    <Card style={styles.half}>
      <View style={styles.cardHead}>
        <View style={[styles.headIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="speedometer-outline" size={16} color={theme.colors.primary} />
        </View>
        <Body weight="semibold" size={14.5}>
          Rythme du mois
        </Body>
      </View>
      <Caption style={{ fontSize: 13, lineHeight: 19 }}>
        {elapsed} % du mois écoulé, {spentPct} % de ton budget de la semaine dépensé.
        {isCurrent && budget > 0 ? (spentPct > elapsed + 5 ? ' Tu dépenses un peu vite.' : ' Tu es dans le rythme.') : ''}
      </Caption>
    </Card>
  );
}

/* ─────────────── Tendances ─────────────── */

const GROUP_KEYS = Object.keys(SPENDING_GROUPS) as SpendingGroup[];

function TrendSection({ month }: { month: MonthKey }) {
  const { data: trend } = useLiveQuery((db) => getTrend(db, month, 6), [month]);
  const months = trend ?? [];
  const active = months.filter((m) => m.expense_cents > 0 || m.income_cents > 0);
  const avgExpense = active.length ? Math.round(active.reduce((s, m) => s + m.expense_cents, 0) / active.length) : 0;
  const avgIncome = active.length ? Math.round(active.reduce((s, m) => s + m.income_cents, 0) / active.length) : 0;
  const priciest = active.reduce<(typeof active)[number] | null>((best, m) => (!best || m.expense_cents > best.expense_cents ? m : best), null);
  const theme = useTheme();

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <View>
          <Heading>Mes dépenses sur 6 mois</Heading>
          <Caption>Par famille, avec tes revenus en repère</Caption>
        </View>
        <ColumnChart
          columns={months.map((m) => ({
            key: m.month,
            label: shortMonthLabel(m.month),
            segments: GROUP_KEYS.map((k) => ({ key: k, label: SPENDING_GROUPS[k].label, cents: m.spending[k], color: SPENDING_GROUPS[k].color })),
            reference: m.income_cents || undefined,
          }))}
          referenceLabel="Revenus"
          emptyLabel="Pas encore de dépenses sur ces mois."
        />
        <ChartLegend
          items={GROUP_KEYS.map((k) => ({ key: k, label: SPENDING_GROUPS[k].label, color: SPENDING_GROUPS[k].color }))}
          reference="revenus"
        />
      </Card>

      <View style={styles.tiles}>
        <StatTile icon="cart-outline" label="Dépenses moyennes" value={formatCents(avgExpense)} hint="par mois" color={theme.colors.primary} />
        <StatTile icon="cash-outline" label="Revenus moyens" value={formatCents(avgIncome)} hint="par mois" color={theme.colors.secondary} />
        <StatTile
          icon="trending-up-outline"
          label="Mois le plus cher"
          value={priciest ? shortMonthLabel(priciest.month) : '—'}
          hint={priciest ? formatCents(priciest.expense_cents) : 'pas de données'}
          color={theme.colors.rose}
        />
        <StatTile
          icon="leaf-outline"
          label="Mis de côté en moyenne"
          value={formatCents(Math.round(avgIncome - avgExpense))}
          hint="revenus − dépenses"
          color={theme.colors.navy}
        />
      </View>

      <Card style={{ gap: spacing.md }}>
        <Heading>Familles de dépenses, mois par mois</Heading>
        {active.length === 0 ? (
          <Caption>Pas encore de données.</Caption>
        ) : (
          <View>
            <View style={styles.tableRow}>
              <Caption style={styles.tableMonth}> </Caption>
              {GROUP_KEYS.map((k) => (
                <Caption key={k} style={styles.tableCell}>
                  {SPENDING_GROUPS[k].label}
                </Caption>
              ))}
            </View>
            {months.map((m) => (
              <View key={m.month} style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: theme.colors.hairline }]}>
                <Body size={13} weight="semibold" style={styles.tableMonth}>
                  {shortMonthLabel(m.month)}
                </Body>
                {GROUP_KEYS.map((k) => (
                  <Body key={k} size={12.5} style={styles.tableCell} numberOfLines={1}>
                    {m.spending[k] ? formatCents(m.spending[k], { compact: true }) : '—'}
                  </Body>
                ))}
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

/* ─────────────── Épargne ─────────────── */

function SavingsSection({ month }: { month: MonthKey }) {
  const theme = useTheme();
  const { data: summary } = useLiveQuery((db) => getMonthSummary(db, month), [month]);
  const { data: history } = useLiveQuery((db) => getBalanceHistory(db, month), [month]);
  const { data: pots } = useLiveQuery((db) => listPots(db, month), [month]);

  // Épargne = économies du mois (revenus − dépenses), cumulées mois après mois.
  const months = history ?? [];
  const totalSaved = months.reduce((s, m) => s + m.balance_cents, 0);
  const average = months.length > 0 ? Math.round(totalSaved / months.length) : 0;
  const rates = months.filter((m) => m.income_cents > 0).map((m) => m.balance_cents / m.income_cents);
  const averageRate = rates.length > 0 ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100) : 0;
  const thisMonth = summary?.balance_cents ?? 0;

  let cumulative = 0;
  const points: LinePoint[] = months.map((m) => {
    cumulative += m.balance_cents;
    return { label: shortMonthLabel(m.month), cents: cumulative };
  });
  if (points.length > 0) {
    for (let i = 1; i <= PROJECTION_MONTHS; i++) {
      points.push({
        label: i === PROJECTION_MONTHS ? `+${PROJECTION_MONTHS}m` : shortMonthLabel(shiftMonthKey(month, i)),
        cents: cumulative + average * i,
        projected: true,
      });
    }
  }

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <View>
          <Heading>Économies cumulées</Heading>
          <Body size={14}>Revenus − dépenses, mois après mois : {formatCents(totalSaved)} au total</Body>
        </View>
        {points.length === 0 ? (
          <EmptyState
            icon="analytics-outline"
            title="Pas encore de données"
            subtitle="Ajoute tes revenus et tes dépenses : ta courbe d’épargne apparaîtra ici."
          />
        ) : (
          <>
            <LineChart points={points} color={theme.colors.primary} projectionColor={theme.colors.rose} />
            <View style={styles.legend}>
              <View style={[styles.legendLine, { backgroundColor: theme.colors.primary }]} />
              <Caption tone="text">cumulé</Caption>
              <View style={styles.legendDash}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.dash, { backgroundColor: theme.colors.rose }]} />
                ))}
              </View>
              <Caption tone="text">au rythme moyen (+{PROJECTION_MONTHS} mois)</Caption>
            </View>
            <View style={styles.kpis}>
              <Kpi value={formatCents(average, { signed: true })} label="en moyenne / mois" color={theme.colors.secondary} />
              <Kpi value={`${averageRate} %`} label="taux d’épargne moyen" color={theme.colors.gold} />
              <Kpi
                value={formatCents(thisMonth, { signed: true })}
                label={`ce mois (${formatCents(thisMonth - average, { signed: true })} vs moy.)`}
                color={theme.colors.primary}
              />
            </View>
          </>
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Heading>Répartition de mes cagnottes</Heading>
        {(pots ?? []).length === 0 ? (
          <Caption>Aucune cagnotte pour l’instant.</Caption>
        ) : (
          <HBars
            items={(pots ?? []).map((p) => ({ key: String(p.id), label: p.name, cents: p.balance_cents, color: p.color }))}
          />
        )}
        <Pressable onPress={() => router.navigate('/cagnottes')} accessibilityRole="button" hitSlop={8}>
          <Caption tone="primary">Voir mon plan d’épargne et la fin d’année →</Caption>
        </Pressable>
      </Card>
    </>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: `${color}${theme.dark ? '33' : '22'}` }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Caption>{label}</Caption>
      <Body weight="bold" size={19} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Body>
      <Caption style={{ fontSize: 11.5 }} numberOfLines={1}>
        {hint}
      </Caption>
    </Card>
  );
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Semaine précédente bouclée : son reste se met de côté (ou se laisse). */
function WeekClosingCard() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const week = shiftWeekKey(currentWeekKey(), -1);
  const { data } = useLiveQuery(
    async (db) => {
      const [closed, envelopes] = await Promise.all([isWeekClosed(db, week), listEnvelopesForWeek(db, week)]);
      return {
        closed,
        tracked: envelopes.some((e) => e.spent_cents > 0),
        leftover: envelopes.reduce((s, e) => s + e.weekly_cents - e.spent_cents, 0),
      };
    },
    [week],
  );
  const index = weeksOfMonth(monthOfWeek(week)).indexOf(week) + 1;
  const canSave = data && data.tracked && !data.closed && data.leftover > 0;

  return (
    <Card style={styles.half}>
      <View style={styles.cardHead}>
        <View style={[styles.headIcon, { backgroundColor: `${theme.colors.secondary}${theme.dark ? '33' : '22'}` }]}>
          <Ionicons name="wallet-outline" size={16} color={theme.colors.secondary} />
        </View>
        <Body weight="semibold" size={14.5} style={{ flex: 1 }}>
          Semaine {index} bouclée{data?.tracked ? ` à ${formatCents(-(data.leftover))}` : ''}
        </Body>
      </View>
      <Caption style={{ fontSize: 13, lineHeight: 19 }}>
        {!data?.tracked
          ? 'Aucune dépense notée la semaine dernière.'
          : data.leftover > 0
            ? data.closed
              ? 'Reste déjà réglé. Bravo !'
              : 'Tu as dépensé moins que prévu. On les met de côté ?'
            : 'Semaine dépassée : on fait mieux cette semaine !'}
      </Caption>
      {canSave ? (
        <View style={styles.closingActions}>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/mouvement', params: { week, amount: String(data.leftover) } })
            }
            accessibilityRole="button"
            accessibilityLabel="Mettre de côté"
            style={[styles.smallPill, { backgroundColor: theme.colors.primary }]}
          >
            <Body size={13} weight="semibold" color={theme.colors.onPrimary}>
              Mettre de côté
            </Body>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => void closeWeek(db, { week, date: todayIso() })}
            accessibilityRole="button"
            accessibilityLabel="Pas cette fois"
          >
            <Caption>Pas cette fois</Caption>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

function Kpi({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={[styles.kpi, { borderColor: color }]}>
      <Body weight="bold" size={15.5} style={{ textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Body>
      <Caption style={{ textAlign: 'center', fontSize: 11.5 }}>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 2, padding: spacing.md },
  tileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  envHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  rank: { width: 14, textAlign: 'center' },
  pctCol: { width: 36, textAlign: 'right' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  tableMonth: { width: 44 },
  tableCell: { flex: 1, textAlign: 'right', paddingLeft: 4 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closingActions: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  smallPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendLine: {
    width: 20,
    height: 3,
    borderRadius: 2,
  },
  legendDash: {
    flexDirection: 'row',
    gap: 3,
    marginLeft: spacing.sm,
  },
  dash: {
    width: 5,
    height: 3,
    borderRadius: 1,
  },
  kpis: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kpi: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: 4,
  },
});
