import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { HBars } from '@/src/components/charts/HBars';
import { PlanCard } from '@/src/components/PlanCard';
import { AppHeader } from '@/src/components/ui/AppHeader';
import { Card } from '@/src/components/ui/Card';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Heading, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getMonthSummary, SPENDING_GROUPS, type SpendingGroup } from '@/src/features/summary/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export default function SummaryScreen() {
  const theme = useTheme();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const { data: summary } = useLiveQuery((db) => getMonthSummary(db, month), [month]);

  const income = summary?.income_cents ?? 0;
  const expense = summary?.expense_cents ?? 0;
  const balance = summary?.balance_cents ?? 0;
  const groups = (Object.keys(SPENDING_GROUPS) as SpendingGroup[]).map((key) => ({
    key,
    label: SPENDING_GROUPS[key].label,
    color: SPENDING_GROUPS[key].color,
    cents: summary?.spending[key] ?? 0,
  }));
  const top = groups.reduce((best, g) => (g.cents > best.cents ? g : best), groups[0]);
  const rate = income > 0 ? Math.round((balance / income) * 100) : 0;

  return (
    <Screen bottomInset={90}>
      <AppHeader title="Synthèse" />
      <MonthSwitcher month={month} onChange={setMonth} />
      {summary ? <PlanCard summary={summary} month={month} /> : null}

      <View style={styles.row}>
        <Tile icon="layers-outline" color={theme.colors.secondary} title="Revenus" cents={income} caption="Entrées du mois" />
        <Tile icon="cart-outline" color={theme.colors.primary} title="Dépenses" cents={expense} caption="Toutes catégories" />
        <Tile
          icon="wallet-outline"
          color={theme.colors.gold}
          title="Solde"
          cents={balance}
          caption="Économies du mois"
          danger={balance < 0}
        />
      </View>

      <View style={styles.row}>
        <SmallTile icon="pie-chart-outline" color={theme.colors.navy} label="La plus dépensée" value={top.cents > 0 ? top.label : '—'} />
        <SmallTile icon="leaf-outline" color={theme.colors.secondary} label="Taux d’épargne" value={`${rate} %`} />
        <SmallTile icon="bag-handle-outline" color={theme.colors.rose} label="Cagnottes actives" value={String(summary?.pots_count ?? 0)} />
      </View>

      <Card style={[styles.assets, { borderColor: theme.colors.text }]}>
        <Ionicons name="document-text-outline" size={24} color={theme.colors.primary} />
        <View style={{ flex: 1 }}>
          <Body weight="semibold">Total de mes avoirs</Body>
          <Caption>Économies + solde indicatif</Caption>
        </View>
        <Money cents={(summary?.pots_total_cents ?? 0) + balance} size={17} weight="bold" />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <View>
          <Heading>Dépenses</Heading>
          <Caption>Répartition de toutes tes dépenses du mois</Caption>
        </View>
        {expense > 0 ? <HBars items={groups} /> : <Caption>Aucune dépense ce mois-ci.</Caption>}
      </Card>
    </Screen>
  );
}

function Tile({
  icon,
  color,
  title,
  cents,
  caption,
  danger,
}: {
  icon: IconName;
  color: string;
  title: string;
  cents: number;
  caption: string;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Card style={[styles.tile, { borderColor: theme.colors.text }]}>
      <View style={[styles.bigDot, { backgroundColor: color }]}>
        <Ionicons name={icon} size={26} color={theme.colors.onAccent} />
      </View>
      <Body weight="semibold" size={15}>
        {title}
      </Body>
      <Money cents={cents} size={16} weight="bold" tone={danger ? 'danger' : 'text'} numberOfLines={1} adjustsFontSizeToFit />
      <Caption style={{ textAlign: 'center' }}>{caption}</Caption>
    </Card>
  );
}

function SmallTile({ icon, color, label, value }: { icon: IconName; color: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card style={styles.smallTile}>
      <View style={[styles.dot, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color={theme.colors.onAccent} />
      </View>
      <Caption tone="text" style={{ textAlign: 'center' }}>
        {label}
      </Caption>
      <Body weight="bold" size={15} numberOfLines={1}>
        {value}
      </Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderWidth: 1.2,
    borderRadius: radius.xl,
  },
  bigDot: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  smallTile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xl,
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assets: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.2,
    borderRadius: radius.xl,
  },
});
