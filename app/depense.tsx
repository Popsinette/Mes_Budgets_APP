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
import { currentWeekKey, todayIso, weekDays, weekKeyOf, weekdayLabel } from '@/src/utils/dates';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { centsToInput, parseAmountToCents } from '@/src/utils/money';

export default function ExpenseModal() {
  const params = useLocalSearchParams<{ id?: string; week?: string; envelopeId?: string }>();
  const id = params.id ? Number(params.id) : null;
  const { data: envelopes } = useLiveQuery((db) => listEnvelopes(db));
  const { data: expense } = useLiveQuery(async (db) => (id ? getExpense(db, id) : null), [id]);

  if (!envelopes || (id && !expense)) return <Screen />;
  return (
    <ExpenseForm
      envelopes={envelopes}
      expense={expense ?? null}
      week={params.week ?? currentWeekKey()}
      envelopeId={params.envelopeId ? Number(params.envelopeId) : null}
    />
  );
}

function ExpenseForm({
  envelopes,
  expense,
  week: initialWeek,
  envelopeId,
}: {
  envelopes: Envelope[];
  expense: Expense | null;
  week: string;
  envelopeId: number | null;
}) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const week = expense ? expense.week : initialWeek;
  const days = weekDays(week);
  const today = todayIso();

  const [amount, setAmount] = useState(expense ? centsToInput(expense.amount_cents) : '');
  const [label, setLabel] = useState(expense?.label ?? '');
  const [selectedEnvelope, setSelectedEnvelope] = useState<number | null>(
    expense?.envelope_id ?? envelopeId ?? envelopes[0]?.id ?? null,
  );
  // Par défaut : aujourd'hui si la semaine est en cours, sinon son lundi.
  const [date, setDate] = useState(expense?.date ?? (weekKeyOf(today) === week ? today : week));
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

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Jour</Eyebrow>
        <View style={styles.days}>
          {days.map((day) => {
            const selected = day === date;
            return (
              <Pressable
                key={day}
                onPress={() => setDate(day)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={weekdayLabel(day)}
                style={[
                  styles.day,
                  {
                    backgroundColor: selected ? theme.colors.primary : theme.colors.card,
                    borderColor: selected ? theme.colors.primary : day === today ? theme.colors.text : theme.colors.border,
                  },
                ]}
              >
                {weekdayLabel(day)
                  .split(' ')
                  .map((part, i) => (
                    <Body
                      key={part}
                      size={i === 0 ? 11 : 15}
                      weight={i === 0 ? 'medium' : 'semibold'}
                      color={selected ? theme.colors.onPrimary : i === 0 ? theme.colors.textMuted : theme.colors.text}
                    >
                      {part.replace('.', '')}
                    </Body>
                  ))}
              </Pressable>
            );
          })}
        </View>
      </View>

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
  days: {
    flexDirection: 'row',
    gap: 6,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
