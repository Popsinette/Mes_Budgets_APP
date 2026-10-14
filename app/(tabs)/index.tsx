import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FAB } from '@/src/components/ui/FAB';
import { WeekSwitcher } from '@/src/components/ui/MonthSwitcher';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money, Title } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  closeWeek,
  deleteExpense,
  isWeekClosed,
  listEnvelopesForWeek,
  listExpensesForWeek,
  type EnvelopeWithSpending,
  type Expense,
} from '@/src/features/envelopes/repository';
import { useSelectedWeek } from '@/src/store/week';
import { spacing, useTheme } from '@/src/theme';
import {
  currentWeekKey,
  daysLeftInWeek,
  longDayLabel,
  shiftWeekKey,
  todayIso,
  weekLabel,
  weekPaceRatio,
} from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

const remainingOf = (envelopes: EnvelopeWithSpending[] | undefined) =>
  (envelopes ?? []).reduce((sum, e) => sum + e.weekly_cents - e.spent_cents, 0);

export default function WeekScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const week = useSelectedWeek((s) => s.week);
  const setWeek = useSelectedWeek((s) => s.setWeek);

  const thisWeek = currentWeekKey();
  const isCurrent = week === thisWeek;
  const isPast = week < thisWeek;
  // Semaine à « solder » : celle affichée si elle est terminée, sinon la précédente.
  const closingWeek = isPast ? week : isCurrent ? shiftWeekKey(week, -1) : null;

  const { data: envelopes } = useLiveQuery((db) => listEnvelopesForWeek(db, week), [week]);
  const { data: expenses } = useLiveQuery((db) => listExpensesForWeek(db, week), [week]);
  const { data: closing } = useLiveQuery(
    async (db) => {
      if (!closingWeek) return null;
      const [closed, list] = await Promise.all([
        isWeekClosed(db, closingWeek),
        listEnvelopesForWeek(db, closingWeek),
      ]);
      // Une semaine sans aucune dépense n'a pas été suivie (app pas encore utilisée) : rien à solder.
      const tracked = list.some((e) => e.spent_cents > 0);
      return { closed: closed || !tracked, leftover: remainingOf(list) };
    },
    [closingWeek],
  );

  const budget = (envelopes ?? []).reduce((sum, e) => sum + e.weekly_cents, 0);
  const remaining = remainingOf(envelopes);
  const daysLeft = daysLeftInWeek(week);
  const showClosing = closingWeek && closing && !closing.closed && closing.leftover > 0;

  const confirmDelete = (expense: Expense) => {
    confirmAction({
      title: 'Supprimer la dépense',
      message: `Supprimer « ${expense.label} » (${formatCents(expense.amount_cents)}) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteExpense(db, expense.id),
    });
  };

  // Dépenses groupées par jour (déjà triées du plus récent au plus ancien).
  const days: Array<{ day: string; items: Expense[] }> = [];
  for (const expense of expenses ?? []) {
    const last = days[days.length - 1];
    if (last && last.day === expense.date) last.items.push(expense);
    else days.push({ day: expense.date, items: [expense] });
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={80}>
        <View style={styles.headerRow}>
          <Title>Ma semaine</Title>
          <Pressable
            hitSlop={8}
            onPress={() => router.push('/reglages')}
            accessibilityRole="button"
            accessibilityLabel="Réglages"
            style={[styles.roundButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <Ionicons name="settings-outline" size={19} color={theme.colors.text} />
          </Pressable>
        </View>

        <WeekSwitcher week={week} onChange={setWeek} />

        {/* Héros : ce qu'il reste à dépenser jusqu'à dimanche. */}
        <View>
          <Eyebrow>
            {isCurrent ? 'Il me reste jusqu’à dimanche' : isPast ? 'Reste de la semaine' : 'Budget de la semaine'}
          </Eyebrow>
          <Money
            cents={remaining}
            size={46}
            weight="xbold"
            tone={remaining < 0 ? 'danger' : 'text'}
            style={{ marginTop: 2 }}
          />
          <Caption style={{ marginTop: 4 }}>
            {budget === 0
              ? 'Fixe le montant de tes enveloppes pour commencer.'
              : isCurrent && remaining > 0
                ? `${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''} · soit ${formatCents(Math.floor(remaining / daysLeft))} par jour`
                : `sur ${formatCents(budget)} prévus cette semaine`}
          </Caption>
        </View>

        {showClosing ? (
          <Card style={{ gap: spacing.md, backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successSoft }}>
            <View style={{ gap: 2 }}>
              <Body weight="semibold">Bravo ! Semaine du {weekLabel(closingWeek)} terminée</Body>
              <Caption>
                Il te reste {formatCents(closing.leftover)} sur tes enveloppes. Mets-les de côté dans une poche
                d’épargne.
              </Caption>
            </View>
            <View style={styles.buttonsRow}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Mettre de côté"
                  onPress={() =>
                    router.push({
                      pathname: '/mouvement',
                      params: { week: closingWeek, amount: String(closing.leftover) },
                    })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Pas cette fois"
                  variant="secondary"
                  onPress={() => void closeWeek(db, { week: closingWeek, date: todayIso() })}
                />
              </View>
            </View>
          </Card>
        ) : null}

        <SectionHeader
          title="Mes enveloppes"
          actionLabel="Nouvelle"
          onAction={() => router.push('/enveloppe')}
        />
        {(envelopes ?? []).map((envelope) => {
          const left = envelope.weekly_cents - envelope.spent_cents;
          const ratio = envelope.weekly_cents > 0 ? envelope.spent_cents / envelope.weekly_cents : 0;
          return (
            <Card
              key={envelope.id}
              style={{ gap: spacing.md }}
              onPress={() => router.push({ pathname: '/enveloppe', params: { id: String(envelope.id) } })}
            >
              <View style={styles.envelopeRow}>
                <CategoryIcon icon={envelope.icon} color={envelope.color} size={42} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Body weight="semibold" size={15.5}>
                    {envelope.name}
                  </Body>
                  <Caption>
                    {envelope.weekly_cents === 0
                      ? 'Touchez pour fixer le montant'
                      : `Dépensé ${formatCents(envelope.spent_cents)} sur ${formatCents(envelope.weekly_cents)}`}
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Money cents={left} size={20} weight="bold" tone={left < 0 ? 'danger' : 'text'} />
                  <Caption>{left < 0 ? 'de dépassement' : 'restant'}</Caption>
                </View>
              </View>
              {envelope.weekly_cents > 0 ? (
                <ProgressBar
                  ratio={ratio}
                  color={ratio > 1 ? theme.colors.danger : ratio > 0.9 ? theme.colors.warning : envelope.color}
                  markerRatio={weekPaceRatio(week)}
                />
              ) : null}
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/depense', params: { week, envelopeId: String(envelope.id) } })
                }
                accessibilityRole="button"
                accessibilityLabel={`Ajouter une dépense ${envelope.name}`}
                style={[styles.addRow, { borderColor: theme.colors.border }]}
              >
                <Ionicons name="add" size={17} color={theme.colors.text} />
                <Body weight="semibold" size={13.5}>
                  Dépense {envelope.name}
                </Body>
              </Pressable>
            </Card>
          );
        })}

        <SectionHeader title="Dépenses de la semaine" />
        {days.length === 0 ? (
          <Card>
            <EmptyState
              icon="receipt-outline"
              title="Aucune dépense"
              subtitle="Note chaque achat dès que tu le fais : ton reste jusqu’à dimanche se met à jour."
            />
          </Card>
        ) : (
          <Card style={{ paddingVertical: spacing.sm }}>
            {days.map(({ day, items }, dayIndex) => (
              <View key={day}>
                <Eyebrow style={{ marginTop: dayIndex === 0 ? spacing.xs : spacing.md, marginBottom: spacing.xs }}>
                  {longDayLabel(day)}
                </Eyebrow>
                {items.map((expense) => (
                  <Pressable
                    key={expense.id}
                    onPress={() => router.push({ pathname: '/depense', params: { id: String(expense.id) } })}
                    onLongPress={() => confirmDelete(expense)}
                    style={({ pressed }) => [styles.expenseRow, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <CategoryIcon icon={expense.envelope_icon} color={expense.envelope_color} size={34} />
                    <View style={{ flex: 1 }}>
                      <Body weight="medium" numberOfLines={1}>
                        {expense.label}
                      </Body>
                      <Caption>{expense.envelope_name}</Caption>
                    </View>
                    <Money cents={-expense.amount_cents} size={15} />
                  </Pressable>
                ))}
              </View>
            ))}
          </Card>
        )}
        {days.length > 0 ? (
          <Caption style={{ textAlign: 'center' }}>
            Touchez une dépense pour la modifier · appui long pour la supprimer
          </Caption>
        ) : null}
      </Screen>
      <FAB onPress={() => router.push({ pathname: '/depense', params: { week } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  envelopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
