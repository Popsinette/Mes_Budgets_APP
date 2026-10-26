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
  resolveEnvelopeId,
  listEnvelopesForMonth,
  saveExpense,
  type EnvelopeForMonth,
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
  const { data: expense } = useLiveQuery(async (db) => (id ? getExpense(db, id) : null), [id]);

  if (id && !expense) return <Screen />;
  return (
    <ExpenseForm
      expense={expense ?? null}
      defaultDate={month === currentMonthKey() ? todayIso() : isoDayInMonth(month, 1)}
      envelopeId={params.envelopeId ? Number(params.envelopeId) : null}
    />
  );
}

function ExpenseForm({
  expense,
  defaultDate,
  envelopeId,
}: {
  expense: Expense | null;
  defaultDate: string;
  envelopeId: number | null;
}) {
  const theme = useTheme();
  const db = useSQLiteContext();

  const [amount, setAmount] = useState(expense ? centsToInput(expense.amount_cents) : '');
  const [label, setLabel] = useState(expense?.label ?? '');
  const [date, setDate] = useState(expense?.date ?? defaultDate);
  // Pointée = déjà débitée sur le compte. Une nouvelle dépense est « à pointer ».
  const [cleared, setCleared] = useState(Boolean(expense?.cleared_at));
  // Enveloppes proposées : celles du mois de la date (variables : mois de la
  // semaine ; postes : mois civil). Chaque mois a les siennes.
  const weekMonth = monthOfWeek(weekKeyOf(date));
  const calMonth = date.slice(0, 7);
  const { data: options } = useLiveQuery(
    async (db) => {
      const [a, b] = await Promise.all([
        listEnvelopesForMonth(db, weekMonth, currentWeekKey()),
        weekMonth === calMonth ? Promise.resolve(null) : listEnvelopesForMonth(db, calMonth, currentWeekKey()),
      ]);
      return [...a.filter((e) => e.period === 'week'), ...(b ?? a).filter((e) => e.period === 'month')];
    },
    [weekMonth, calMonth],
  );
  const envelopes = options ?? [];
  const [picked, setPicked] = useState<{ id: number | null; name: string | null }>({
    id: expense?.envelope_id ?? envelopeId ?? null,
    name: expense?.envelope_name ?? null,
  });
  // Même enveloppe si elle existe dans le mois, sinon celle du même nom, sinon la première.
  const current =
    envelopes.find((e) => e.id === picked.id) ??
    envelopes.find((e) => picked.name !== null && e.name === picked.name) ??
    envelopes[0] ??
    null;
  const selectedEnvelope = current?.id ?? null;
  const setSelectedEnvelope = (id: number) =>
    setPicked({ id, name: envelopes.find((e) => e.id === id)?.name ?? null });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const cents = parseAmountToCents(amount);
    if (!cents || cents <= 0) {
      notify('Montant invalide', 'Saisis un montant, par exemple 12,50.');
      return;
    }
    const envelope = current;
    if (!envelope) {
      notify('Enveloppe manquante', 'Crée d’abord une enveloppe pour ce mois (Gérer mes enveloppes).');
      return;
    }
    setSaving(true);
    const realId = await resolveEnvelopeId(db, envelope);
    if (!realId) {
      setSaving(false);
      notify('Enveloppe introuvable', 'Réessaie : le mois vient d’être préparé.');
      return;
    }
    await saveExpense(db, {
      id: expense?.id,
      envelopeId: realId,
      label: label.trim() || envelope.name,
      amountCents: cents,
      date,
      cleared,
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
                    backgroundColor: selected ? `${theme.tint(envelope.color)}22` : theme.colors.card,
                    borderColor: selected ? theme.tint(envelope.color) : theme.colors.border,
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

      <Pressable
        onPress={() => setCleared(!cleared)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: cleared }}
        accessibilityLabel="Déjà débitée sur mon compte (pointée)"
        style={[styles.clearRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
      >
        <Ionicons
          name={cleared ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={cleared ? theme.colors.secondary : theme.colors.textMuted}
        />
        <View style={{ flex: 1 }}>
          <Body weight="medium">Déjà débitée sur mon compte</Body>
          <Caption>
            {cleared
              ? 'Pointée : comptée dans le solde de ton compte.'
              : 'À pointer : comptée dans ton budget, et dans ton compte quand tu la pointeras.'}
          </Caption>
        </View>
      </Pressable>

      {current ? (
        <ImpactPreview
          envelope={current}
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
  envelope: EnvelopeForMonth | null;
  date: string;
  cents: number;
  editing: Expense | null;
}) {
  const theme = useTheme();
  const month = envelope ? envelope.month : date.slice(0, 7);
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
    editing && editing.envelope_id === envelope.id
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
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
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
