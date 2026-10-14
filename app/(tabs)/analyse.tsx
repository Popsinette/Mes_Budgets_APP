import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { HBars } from '@/src/components/charts/HBars';
import { LineChart, type LinePoint } from '@/src/components/charts/LineChart';
import { InsightsCard } from '@/src/components/InsightsCard';
import { AppHeader } from '@/src/components/ui/AppHeader';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow, Heading, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { closeWeek, isWeekClosed, listEnvelopesForWeek } from '@/src/features/envelopes/repository';
import { listPots } from '@/src/features/savings/repository';
import { getBalanceHistory, getMonthSummary } from '@/src/features/summary/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import {
  currentMonthKey,
  currentWeekKey,
  monthOfWeek,
  shiftMonthKey,
  shiftWeekKey,
  shortMonthLabel,
  todayIso,
  weeksOfMonth,
} from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

const PROJECTION_MONTHS = 6;

export default function AnalysisScreen() {
  const theme = useTheme();
  const month = useSelectedMonth((s) => s.month);
  const { data: summary } = useLiveQuery((db) => getMonthSummary(db, month), [month]);
  const { data: history } = useLiveQuery((db) => getBalanceHistory(db, month), [month]);
  const { data: pots } = useLiveQuery((db) => listPots(db, month), [month]);

  // Rythme : part du mois écoulée vs part du budget variable dépensée.
  const isCurrent = month === currentMonthKey();
  const elapsed = isCurrent
    ? Math.round((new Date().getDate() / new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()) * 100)
    : month < currentMonthKey()
      ? 100
      : 0;
  const budget = summary?.variables_budget_cents ?? 0;
  const spentPct = budget > 0 ? Math.round(((summary?.variables_spent_cents ?? 0) / budget) * 100) : 0;

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
    <Screen bottomInset={90}>
      <AppHeader title="Analyse de mon budget" />
      <InsightsCard month={month} />

      <View style={styles.row}>
        <Card style={styles.half}>
          <View style={styles.cardHead}>
            <View style={[styles.headIcon, { backgroundColor: theme.colors.navy }]}>
              <Ionicons name="speedometer-outline" size={16} color={theme.colors.onAccent} />
            </View>
            <Body weight="semibold" size={14.5}>
              Rythme du mois
            </Body>
          </View>
          <Caption style={{ fontSize: 13, lineHeight: 19 }}>
            {elapsed} % du mois écoulé, {spentPct} % de ton budget variable dépensé.
            {isCurrent && budget > 0
              ? spentPct > elapsed + 5
                ? ' Tu dépenses un peu vite.'
                : ' Tu es dans le rythme.'
              : ''}
          </Caption>
        </Card>
        <WeekClosingCard />
      </View>

      <Eyebrow tone="text" style={{ marginTop: spacing.sm }}>
        Analyse de ton épargne
      </Eyebrow>

      <Card style={{ gap: spacing.md }}>
        <View>
          <Heading>Épargne cumulée</Heading>
          <Body size={14}>
            Tu as mis {formatCents(totalSaved)} de côté au total
          </Body>
        </View>
        {points.length === 0 ? (
          <EmptyState
            icon="analytics-outline"
            title="Pas encore de données"
            subtitle="Ajoute tes revenus et tes dépenses : ta courbe d’épargne apparaîtra ici."
          />
        ) : (
          <>
            <LineChart points={points} color={theme.colors.primary} projectionColor={theme.colors.navy} />
            <View style={styles.legend}>
              <View style={[styles.legendLine, { backgroundColor: theme.colors.primary }]} />
              <Caption tone="text">cumulé</Caption>
              <View style={styles.legendDash}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.dash, { backgroundColor: theme.colors.navy }]} />
                ))}
              </View>
              <Caption tone="text">projeté (+{PROJECTION_MONTHS} mois)</Caption>
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
        <Heading>Répartition de ton épargne</Heading>
        {(pots ?? []).length === 0 ? (
          <Caption>Aucune cagnotte pour l’instant.</Caption>
        ) : (
          <HBars
            items={(pots ?? []).map((p) => ({ key: String(p.id), label: p.name, cents: p.balance_cents, color: p.color }))}
          />
        )}
      </Card>
    </Screen>
  );
}

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
        <View style={[styles.headIcon, { backgroundColor: theme.colors.secondary }]}>
          <Ionicons name="wallet-outline" size={16} color={theme.colors.onAccent} />
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
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: 4,
  },
});
