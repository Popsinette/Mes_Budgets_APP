import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { DatePickerGrid } from '@/src/components/ui/DatePickerGrid';
import { AmountField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  hasMonthPlan,
  listPots,
  plannedFor,
  setMonthPlan,
  setPlanDone,
  type PotWithBalance,
} from '@/src/features/savings/repository';
import { useSelectedMonth } from '@/src/store/month';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, isoDayInMonth, monthKeyLabel, todayIso, type MonthKey } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { centsToInput, formatCents, parseAmountToCents } from '@/src/utils/money';

/**
 * Virement du mois vers une cagnotte : montant de ce mois (plus ou moins que
 * le versement mensuel, ou un virement ponctuel), date prévue, et pointage
 * une fois le virement fait.
 */
export default function PlanTransferModal() {
  const params = useLocalSearchParams<{ potId?: string; month?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const month = (params.month ?? globalMonth) as MonthKey;
  const { data: pots } = useLiveQuery((db) => listPots(db, month), [month]);
  if (!pots) return <Screen />;
  return <PlanTransferForm pots={pots} month={month} potId={params.potId ? Number(params.potId) : null} />;
}

const defaultDate = (month: MonthKey) => (month === currentMonthKey() ? todayIso() : isoDayInMonth(month, 1));

function PlanTransferForm({ pots, month, potId }: { pots: PotWithBalance[]; month: MonthKey; potId: number | null }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [selected, setSelected] = useState<number | null>(potId ?? pots[0]?.id ?? null);
  const pot = pots.find((p) => p.id === selected) ?? null;
  const [amount, setAmount] = useState(centsToInput(pot ? plannedFor(pot) || pot.monthly_cents : null));
  const [date, setDate] = useState(pot?.plan_date ?? defaultDate(month));
  const [done, setDone] = useState(pot?.plan_done === 1);
  const [saving, setSaving] = useState(false);
  const monthLabel = monthKeyLabel(month);

  const pick = (p: PotWithBalance) => {
    setSelected(p.id);
    setAmount(centsToInput(plannedFor(p) || p.monthly_cents));
    setDate(p.plan_date ?? defaultDate(month));
    setDone(p.plan_done === 1);
  };

  const save = async () => {
    if (!pot) {
      notify('Cagnotte manquante', 'Crée d’abord une cagnotte.');
      return;
    }
    const cents = parseAmountToCents(amount);
    if (cents === null || cents < 0) {
      notify('Montant invalide', 'Saisis un montant, par exemple 150.');
      return;
    }
    if (date.slice(0, 7) !== month) {
      notify('Date hors du mois', `Choisis une date en ${monthLabel}.`);
      return;
    }
    setSaving(true);
    // Le montant habituel n'est pas recopié : changer le mensuel plus tard le suivra.
    await setMonthPlan(db, pot, month, { amountCents: cents === pot.monthly_cents ? null : cents, date });
    if (cents > 0 && done !== (pot.plan_done === 1)) await setPlanDone(db, pot, month, done, date);
    router.back();
  };

  const remove = async () => {
    if (!pot) return;
    setSaving(true);
    await setPlanDone(db, pot, month, false, date);
    await setMonthPlan(db, pot, month, { amountCents: null, date: null });
    router.back();
  };

  const reset = async () => {
    if (!pot) return;
    setSaving(true);
    await setMonthPlan(db, pot, month, { amountCents: null, date: null });
    router.back();
  };

  const skip = async () => {
    if (!pot) return;
    setSaving(true);
    await setMonthPlan(db, pot, month, { amountCents: 0, date: null });
    router.back();
  };

  const custom = pot?.plan_amount_cents !== null || pot?.plan_date !== null;

  return (
    <Screen>
      <ModalHeader title={`Virement de ${monthLabel.split(' ')[0]}`} />

      {potId === null ? (
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Cagnotte</Eyebrow>
          {pots.map((p) => {
            const isSelected = p.id === selected;
            return (
              <Pressable
                key={p.id}
                onPress={() => pick(p)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={p.name}
                style={[
                  styles.pot,
                  {
                    backgroundColor: isSelected ? `${theme.tint(p.color)}22` : theme.colors.card,
                    borderColor: isSelected ? theme.tint(p.color) : theme.colors.border,
                  },
                ]}
              >
                <CategoryIcon icon={p.icon} color={p.color} size={34} />
                <View style={{ flex: 1 }}>
                  <Body weight="semibold">{p.name}</Body>
                  <Caption>{hasMonthPlan(p) ? `${formatCents(plannedFor(p))} prévus` : 'rien de prévu ce mois-ci'}</Caption>
                </View>
                <Money cents={p.balance_cents} size={14} tone="muted" />
              </Pressable>
            );
          })}
        </View>
      ) : pot ? (
        <View style={styles.head}>
          <CategoryIcon icon={pot.icon} color={pot.color} size={40} />
          <View style={{ flex: 1 }}>
            <Body weight="semibold">{pot.name}</Body>
            <Caption>Solde actuel {formatCents(pot.balance_cents)}</Caption>
          </View>
        </View>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <AmountField label="Montant ce mois-ci" value={amount} onChangeText={setAmount} placeholder="0,00" />
        <Caption>
          {pot?.monthly_cents
            ? `Habituellement ${formatCents(pot.monthly_cents)} par mois : mets plus ou moins, seul ${monthLabel} change.`
            : 'Virement ponctuel : cette cagnotte n’a pas de versement mensuel.'}
        </Caption>
      </View>

      <DatePickerGrid label="Date prévue" value={date} onChange={setDate} />

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Pointage</Eyebrow>
        <View style={styles.row}>
          <Chip label="À faire" selected={!done} onPress={() => setDone(false)} />
          <Chip label="Fait · pointé" selected={done} onPress={() => setDone(true)} />
        </View>
        <Caption>
          Un virement à faire compte dans ton plan ; pointé, il passe dans ta cagnotte et sort de ton compte courant.
        </Caption>
      </View>

      <Button label="Enregistrer" onPress={() => void save()} loading={saving} />
      {pot?.monthly_cents ? (
        <Button label="Pas ce mois-ci" variant="secondary" onPress={() => void skip()} />
      ) : pot && hasMonthPlan(pot) ? (
        <Button label="Supprimer ce virement" variant="secondary" onPress={() => void remove()} />
      ) : null}
      {pot?.monthly_cents && custom ? (
        <Button label="Revenir au montant habituel" variant="secondary" onPress={() => void reset()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
});
