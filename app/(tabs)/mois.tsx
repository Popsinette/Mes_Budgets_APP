import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { getMonthWeeks } from '@/src/features/envelopes/repository';
import {
  FREQUENCY_LABELS,
  listFixedForMonth,
  setFixedChecked,
  type FixedItemForMonth,
} from '@/src/features/fixed/repository';
import { listPots } from '@/src/features/savings/repository';
import { useSelectedMonth } from '@/src/store/month';
import { useSelectedWeek } from '@/src/store/week';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, currentWeekKey, weekLabel } from '@/src/utils/dates';
import { formatCents } from '@/src/utils/money';

const sum = (items: Array<{ amount_cents: number }>) => items.reduce((s, i) => s + i.amount_cents, 0);

export default function MonthScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const month = useSelectedMonth((s) => s.month);
  const setMonth = useSelectedMonth((s) => s.setMonth);
  const setWeek = useSelectedWeek((s) => s.setWeek);

  const { data: items } = useLiveQuery((db) => listFixedForMonth(db, month), [month]);
  const { data: weeks } = useLiveQuery((db) => getMonthWeeks(db, month), [month]);
  const { data: pots } = useLiveQuery((db) => listPots(db, month), [month]);

  const incomes = (items ?? []).filter((i) => i.kind === 'income');
  const charges = (items ?? []).filter((i) => i.kind === 'charge');
  const incomeTotal = sum(incomes);
  const chargeTotal = sum(charges);
  const chargesPaid = sum(charges.filter((c) => c.checked));
  const savingsPlan = (pots ?? []).reduce((s, p) => s + (p.monthly_cents ?? 0), 0);
  const weekCount = weeks?.length ?? 0;
  const weeklyBudget = weeks?.[0]?.budget_cents ?? 0;
  const envelopesPlan = weeklyBudget * weekCount;
  const spent = (weeks ?? []).reduce((s, w) => s + w.spent_cents, 0);
  const leftToLive = incomeTotal - chargeTotal - savingsPlan - envelopesPlan;

  const isCurrentMonth = month === currentMonthKey();
  const today = new Date().getDate();
  const thisWeek = currentWeekKey();

  const toggle = (item: FixedItemForMonth) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setFixedChecked(db, item.id, month, !item.checked);
  };

  const renderItem = (item: FixedItemForMonth) => {
    const isIncome = item.kind === 'income';
    const late = !item.checked && isCurrentMonth && item.day < today;
    const soon = !item.checked && isCurrentMonth && !late && item.day - today <= 3;
    return (
      <View key={item.id} style={styles.itemRow}>
        <Pressable
          style={styles.itemMain}
          onPress={() => toggle(item)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.name}
        >
          <Ionicons
            name={item.checked ? 'checkmark-circle' : 'ellipse-outline'}
            size={25}
            color={item.checked ? theme.colors.success : theme.colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Body
                weight="semibold"
                numberOfLines={1}
                style={item.checked ? { textDecorationLine: 'line-through' } : undefined}
              >
                {item.name}
              </Body>
              {late ? (
                <View style={[styles.badge, { backgroundColor: theme.colors.dangerSoft }]}>
                  <Caption tone="danger" style={styles.badgeText}>
                    {isIncome ? 'Attendu' : 'En retard'}
                  </Caption>
                </View>
              ) : soon ? (
                <View style={[styles.badge, { backgroundColor: theme.colors.warningSoft }]}>
                  <Caption tone="warning" style={styles.badgeText}>
                    Bientôt
                  </Caption>
                </View>
              ) : null}
            </View>
            <Caption>
              le {item.day} · {FREQUENCY_LABELS[item.frequency].toLowerCase()}
            </Caption>
          </View>
          <Money
            cents={item.amount_cents}
            size={15.5}
            weight="bold"
            tone={item.checked ? 'muted' : isIncome ? 'income' : 'text'}
          />
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => router.push({ pathname: '/fixe', params: { id: String(item.id), month } })}
          accessibilityRole="button"
          accessibilityLabel={`Modifier ${item.name}`}
          style={{ padding: spacing.xs }}
        >
          <Ionicons name="create-outline" size={19} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    );
  };

  const planLines: Array<[string, number, string?]> = [
    ['Revenus', incomeTotal],
    ['Charges fixes', -chargeTotal],
    ['Épargne programmée', -savingsPlan],
    ['Enveloppes', -envelopesPlan, `${weekCount} semaines × ${formatCents(weeklyBudget)}`],
  ];

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={80}>
        <Title>Mon mois</Title>
        <MonthSwitcher month={month} onChange={setMonth} />

        {/* Le plan du mois, dans l'ordre de la méthode : revenus → fixes → épargne → enveloppes. */}
        <View>
          <Eyebrow>Reste à vivre prévu</Eyebrow>
          <Money
            cents={leftToLive}
            size={46}
            weight="xbold"
            tone={leftToLive < 0 ? 'danger' : 'text'}
            style={{ marginTop: 2 }}
          />
          <Caption style={{ marginTop: 4 }}>
            {leftToLive < 0
              ? 'Ton plan dépasse tes revenus : réduis une enveloppe, une charge ou l’épargne programmée.'
              : leftToLive > 0
                ? 'Non attribué : de quoi grossir ton épargne ou tes enveloppes.'
                : 'Chaque euro a sa place.'}
          </Caption>
        </View>

        <Card style={{ gap: spacing.sm }}>
          {planLines.map(([label, cents, hint]) => (
            <View key={label} style={styles.planRow}>
              <View style={{ flex: 1 }}>
                <Body size={14.5}>{label}</Body>
                {hint ? <Caption>{hint}</Caption> : null}
              </View>
              <Money cents={cents} size={15} signed={cents !== 0} tone={cents > 0 ? 'income' : 'text'} />
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: theme.colors.hairline }]} />
          <View style={styles.planRow}>
            <Body weight="semibold" style={{ flex: 1 }}>
              Reste à vivre
            </Body>
            <Money cents={leftToLive} size={16} weight="bold" tone={leftToLive < 0 ? 'danger' : 'text'} />
          </View>
        </Card>

        {chargeTotal > 0 ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.planRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Eyebrow>Charges prélevées</Eyebrow>
                <Money cents={chargesPaid} size={22} weight="bold" />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Eyebrow>Encore à venir</Eyebrow>
                <Money cents={chargeTotal - chargesPaid} size={16} tone="muted" />
              </View>
            </View>
            <ProgressBar ratio={chargesPaid / chargeTotal} color={theme.colors.success} />
          </Card>
        ) : null}

        {(items ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="Rien de planifié ce mois-ci"
              subtitle="Ajoute ton salaire et tes charges fixes (loyer, factures, abonnements…) avec le bouton +."
            />
          </Card>
        ) : null}

        {incomes.length > 0 ? (
          <>
            <SectionHeader title={`Revenus · ${formatCents(incomeTotal)}`} />
            <Card style={styles.listCard}>{incomes.map(renderItem)}</Card>
          </>
        ) : null}

        {charges.length > 0 ? (
          <>
            <SectionHeader title={`Charges fixes · ${formatCents(chargeTotal)}`} />
            <Card style={styles.listCard}>{charges.map(renderItem)}</Card>
            <Caption style={{ textAlign: 'center' }}>
              Coche une ligne quand elle est reçue ou prélevée · ✎ pour la modifier
            </Caption>
          </>
        ) : null}

        <SectionHeader title={`Enveloppes · ${formatCents(spent)} dépensés`} />
        <Card style={styles.listCard}>
          {(weeks ?? []).map((w) => {
            const left = w.budget_cents - w.spent_cents;
            const future = w.week > thisWeek;
            return (
              <Pressable
                key={w.week}
                style={styles.itemRow}
                onPress={() => {
                  setWeek(w.week);
                  router.navigate('/');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Semaine du ${weekLabel(w.week)}`}
              >
                <View style={{ flex: 1 }}>
                  <Body weight="medium">
                    {weekLabel(w.week)}
                    {w.week === thisWeek ? ' · en cours' : ''}
                  </Body>
                  <Caption>
                    {future && w.spent_cents === 0
                      ? `${formatCents(w.budget_cents)} prévus`
                      : `Dépensé ${formatCents(w.spent_cents)} sur ${formatCents(w.budget_cents)}`}
                  </Caption>
                </View>
                <Money cents={left} size={15} weight="bold" tone={left < 0 ? 'danger' : future ? 'muted' : 'success'} />
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </Pressable>
            );
          })}
        </Card>
      </Screen>
      <FAB onPress={() => router.push({ pathname: '/fixe', params: { month } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10.5,
  },
});
