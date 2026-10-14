import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteExpense,
  getExpense,
  listEnvelopes,
  saveExpense,
  type Envelope,
  type Expense,
} from '@/src/features/envelopes/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, isoDayInMonth, todayIso } from '@/src/utils/dates';
import { useSelectedMonth } from '@/src/store/month';
import { DatePickerGrid } from '@/src/components/ui/DatePickerGrid';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { centsToInput, parseAmountToCents } from '@/src/utils/money';

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
    expense?.envelope_id ?? envelopeId ?? envelopes[0]?.id ?? null,
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
          {envelopes.map((envelope) => {
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

      <DatePickerGrid value={date} onChange={setDate} />

      <Button label={expense ? 'Enregistrer' : 'Ajouter la dépense'} onPress={() => void save()} loading={saving} />
      {expense ? <Button label="Supprimer" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
