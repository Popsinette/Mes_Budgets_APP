import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, View } from 'react-native';
import { ExpenseList } from '@/src/components/ExpenseList';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteExpense,
  listEnvelopesForMonth,
  listExpensesForEnvelope,
  type Expense,
} from '@/src/features/envelopes/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { currentWeekKey, monthKeyLabel, weekLabel, weekPaceRatio, weeksOfMonth } from '@/src/utils/dates';
import { confirmAction } from '@/src/utils/dialogs';
import { formatCents } from '@/src/utils/money';

/** Détail d'une enveloppe sur le mois : reste, semaine par semaine, dépenses. */
export default function EnvelopeDetail() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id: string; month?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const month = params.month ?? globalMonth;
  const id = Number(params.id);
  const thisWeek = currentWeekKey();
  const { data: envelopes } = useLiveQuery((db) => listEnvelopesForMonth(db, month, thisWeek), [month, thisWeek]);
  const { data: expenses } = useLiveQuery((db) => listExpensesForEnvelope(db, id, month), [id, month]);
  const envelope = envelopes?.find((e) => e.id === id);
  if (!envelope) return <Screen />;

  const left = envelope.budget_cents - envelope.spent_cents;
  const ratio = envelope.budget_cents > 0 ? envelope.spent_cents / envelope.budget_cents : 0;
  const isWeek = envelope.period === 'week';

  const confirmDelete = (expense: Expense) =>
    confirmAction({
      title: 'Supprimer la dépense',
      message: `Supprimer « ${expense.label} » (${formatCents(expense.amount_cents)}) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => void deleteExpense(db, expense.id),
    });

  return (
    <Screen>
      <ModalHeader title={envelope.name} />
      <View style={styles.hero}>
        <CategoryIcon icon={envelope.icon} color={envelope.color} size={52} />
        <View style={{ flex: 1 }}>
          <Eyebrow>{left < 0 ? 'Dépassé' : 'Reste'} · {monthKeyLabel(month)}</Eyebrow>
          <Money cents={left} size={34} weight="xbold" tone={left < 0 ? 'danger' : 'text'} />
          <Caption>
            Dépensé {formatCents(envelope.spent_cents)} sur {formatCents(envelope.budget_cents)}
            {isWeek ? ` · ${formatCents(envelope.weekly_cents)} par semaine` : ''}
          </Caption>
        </View>
      </View>
      <ProgressBar ratio={ratio} color={ratio > 1 ? theme.colors.danger : envelope.color} height={10} />
      <Button
        label={`Modifier le montant (${formatCents(envelope.weekly_cents)} par ${isWeek ? 'semaine' : 'mois'})`}
        variant="secondary"
        onPress={() => router.push({ pathname: '/enveloppe', params: { id: String(envelope.id), month } })}
      />

      {isWeek ? (
        <>
          <SectionHeader title="Semaine par semaine" />
          <Card style={{ gap: spacing.md }}>
            {weeksOfMonth(month).map((week) => {
              const spent = (expenses ?? []).filter((x) => x.week === week).reduce((s, x) => s + x.amount_cents, 0);
              const weekLeft = envelope.weekly_cents - spent;
              const r = envelope.weekly_cents > 0 ? spent / envelope.weekly_cents : 0;
              return (
                <View key={week} style={{ gap: 6 }}>
                  <View style={styles.weekRow}>
                    <Body weight="medium" style={{ flex: 1 }}>
                      {weekLabel(week)}
                      {week === thisWeek ? ' · en cours' : ''}
                    </Body>
                    <Money cents={weekLeft} size={14.5} tone={weekLeft < 0 ? 'danger' : 'text'} />
                  </View>
                  <ProgressBar
                    ratio={r}
                    color={r > 1 ? theme.colors.danger : envelope.color}
                    height={6}
                    markerRatio={weekPaceRatio(week)}
                  />
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      <Button
        label={`Ajouter une dépense ${envelope.name}`}
        onPress={() => router.push({ pathname: '/depense', params: { envelopeId: String(envelope.id), month } })}
      />

      <SectionHeader title="Dépenses" />
      <ExpenseList expenses={expenses ?? []} empty="Aucune dépense ce mois-ci." onDelete={confirmDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
