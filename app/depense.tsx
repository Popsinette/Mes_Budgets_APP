import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { Ionicons } from '@expo/vector-icons';
import { getMonthSummary } from '@/src/features/summary/repository';
import {
  deleteExpense,
  getExpense,
  isEnvelopeActive,
  listEnvelopes,
  listEnvelopesForMonth,
  saveExpense,
  type Envelope,
  type Expense,
} from '@/src/features/envelopes/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, currentWeekKey, isoDayInMonth, monthOfWeek, todayIso, weekKeyOf } from '@/src/utils/dates';
import { useSelectedMonth } from '@/src/store/month';
import { DatePickerGrid } from '@/src/components/ui/DatePickerGrid';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { centsToInput, formatCents, parseAmountToCents } from '@/src/utils/money';

export default function ExpenseModal() {
  const params = useLocalSearchParams<{ id?: string; month?: string; envelopeId?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const month = params.month ?? globalMonth;
  const id = params.id ? Number(params.id) : null;
  const { data: envelopes } = useLiveQuery((db) => listEnvelopes(db));
  const { data: expense } = useLiveQuery(async (db) => (id ? getExpense(db, id) : null), [id]);

  if (!envelopes || (id && !expense)) return <Screen />;
  return (
    <ExpenseForm
      envelopes={envelopes}
      expense={expense ?? null}
      defaultDate={month === currentMonthKey() ? todayIso() : isoDayInMonth(month, 1)}
      envelopeId={params.envelopeId ? Number(params.envelopeId) : null}
    />
  );
}

function ExpenseForm({
  envelopes,
  expense,
  defaultDate,
  envelopeId,
}: {
  envelopes: Envelope[];
  expense: Expense | null;
  defaultDate: string;
  envelopeId: number | null;
}) {
  const theme = useTheme();
  const db = useSQLiteContext();

  const [amount, setAmount] = useState(expense ? centsToInput(expense.amount_cents) : '');
  const [label, setLabel] = useState(expense?.label ?? '');
  const [selectedEnvelope, setSelectedEnvelope] = useState<number | null>(
    expense?.envelope_id ??
      envelopeId ??
      envelopes.find((e) => isEnvelopeActive(e, monthOfExpense(e.period, defaultDate)))?.id ??
      null,
  );
  const [date, setDate] = useState(expense?.date ?? defaultDate);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const cents = parseAmountToCents(amount);
    if (!cents || cents <= 0) {
      notify('Montant invalide', 'Saisis un montant, par exemple 12,50.');
      return;
    }
    const envelope = envelopes.find((e) => e.id === selectedEnvelope);
    if (!envelope) {
      notify('Enveloppe manquante', 'Choisis l’enveloppe de cette dépense.');
      return;
    }
    setSaving(true);
    await saveExpense(db, {
      id: expense?.id,
      envelopeId: envelope.id,
      label: label.trim() || envelope.name,
      amountCents: cents,
      date,
    });
    router.back();
  };

  const remove = () => {
    if (!expense) return;
    confirmAction({
      title: 'Supprimer la dépense',
      message: `Supprimer « ${expense.label} » ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await deleteExpense(db, expense.id);
          router.back();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={expense ? 'Modifier la dépense' : 'Nouvelle dépense'} />

      <AmountField label="Montant" value={amount} onChangeText={setAmount} placeholder="0,00" autoFocus={!expense} />

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Enveloppe</Eyebrow>
        <View style={styles.grid}>
          {envelopes
            // Seules les enveloppes qui existent le mois de la dépense (ex. « Anniversaire » en novembre).
            .filter((e) => isEnvelopeActive(e, monthOfExpense(e.period, date)) || e.id === selectedEnvelope)
            .map((envelope) => {
            const selected = envelope.id === selectedEnvelope;
            return (
              <Pressable
                key={envelope.id}
                onPress={() => setSelectedEnvelope(envelope.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={envelope.name}
                style={[
                  styles.envelope,
                  {
                    backgroundColor: selected ? `${envelope.color}22` : theme.colors.card,
                    borderColor: selected ? envelope.color : theme.colors.border,
                  },
                ]}
              >
                <CategoryIcon icon={envelope.icon} color={envelope.color} size={32} />
                <Body weight="semibold" size={14} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {envelope.name}
                </Body>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FormField label="Libellé (optionnel)" value={label} onChangeText={setLabel} placeholder="Marché, coiffeur, cadeau…" />

      {selectedEnvelope ? (
        <ImpactPreview
          envelope={envelopes.find((e) => e.id === selectedEnvelope) ?? null}
          date={date}
          cents={parseAmountToCents(amount) ?? 0}
          editing={expense}
        />
      ) : null}

      <DatePickerGrid value={date} onChange={setDate} />

      <Button label={expense ? 'Enregistrer' : 'Ajouter la dépense'} onPress={() => void save()} loading={saving} />
      {expense ? <Button label="Supprimer" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}

/** Mois auquel une dépense est comptée : celui du lundi (enveloppe hebdo) ou de sa date (poste). */
function monthOfExpense(period: Envelope['period'], date: string): string {
  return period === 'week' ? monthOfWeek(weekKeyOf(date)) : date.slice(0, 7);
}

/**
 * Aperçu en direct : ce qu'il restera dans l'enveloppe et le reste
 * prévisionnel du mois après cette dépense — en rouge si elle fait passer
 * le mois sous zéro.
 */
function ImpactPreview({
  envelope,
  date,
  cents,
  editing,
}: {
  envelope: Envelope | null;
  date: string;
  cents: number;
  editing: Expense | null;
}) {
  const theme = useTheme();
  const month = envelope ? monthOfExpense(envelope.period, date) : date.slice(0, 7);
  const { data } = useLiveQuery(
    async (db) => {
      const [summary, list] = await Promise.all([
        getMonthSummary(db, month),
        listEnvelopesForMonth(db, month, currentWeekKey()),
      ]);
      return { summary, list };
    },
    [month],
  );
  if (!envelope || !data) return null;
  const current = data.list.find((e) => e.id === envelope.id);
  if (!current) return null;

  // En modification : l'ancien montant est déjà compté s'il est dans la même enveloppe et le même mois.
  const already =
    editing && editing.envelope_id === envelope.id && monthOfExpense(editing.envelope_period, editing.date) === month
      ? editing.amount_cents
      : 0;
  const spentAfter = current.spent_cents - already + cents;
  const overrunBefore = Math.max(0, current.spent_cents - current.budget_cents);
  const overrunAfter = Math.max(0, spentAfter - current.budget_cents);
  const forecast = data.summary.forecast_left_cents + overrunBefore - overrunAfter;
  const envelopeLeft = current.budget_cents - spentAfter;
  const red = forecast < 0;
  const color = red ? theme.colors.danger : theme.colors.success;

  return (
    <View
      style={[styles.preview, { backgroundColor: red ? theme.colors.dangerSoft : theme.colors.successSoft }]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={red ? 'alert-circle' : 'checkmark-circle'} size={20} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Body size={13.5} weight="semibold" color={color}>
          {red
            ? `Cette dépense te met dans le rouge : ${formatCents(forecast)} prévus ce mois`
            : `Après cette dépense : ${formatCents(forecast)} de reste prévisionnel`}
        </Body>
        <Caption>
          {current.budget_cents > 0
            ? envelopeLeft < 0
              ? `${envelope.name} dépassée de ${formatCents(-envelopeLeft)} sur le mois`
              : `${envelope.name} : ${formatCents(envelopeLeft)} restants sur le mois`
            : `${envelope.name} n’a pas encore de montant : toute dépense est un dépassement`}
        </Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  envelope: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
});
