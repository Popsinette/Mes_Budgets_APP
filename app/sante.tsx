import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DatePickerGrid } from '@/src/components/ui/DatePickerGrid';
import { Button } from '@/src/components/ui/Button';
import { Chip } from '@/src/components/ui/Chip';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Caption } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deleteHealthExpense,
  getHealthExpense,
  saveHealthExpense,
  type HealthExpense,
} from '@/src/features/health/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing } from '@/src/theme';
import { currentMonthKey, isoDayInMonth, todayIso } from '@/src/utils/dates';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { centsToInput, formatCents, parseAmountToCents } from '@/src/utils/money';

export default function HealthModal() {
  const params = useLocalSearchParams<{ id?: string }>();
  const month = useSelectedMonth((s) => s.month);
  const id = params.id ? Number(params.id) : null;
  const { data: item } = useLiveQuery(async (db) => (id ? getHealthExpense(db, id) : null), [id]);
  if (id && !item) return <Screen />;
  const defaultDate = month === currentMonthKey() ? todayIso() : isoDayInMonth(month, 1);
  return <HealthForm item={item ?? null} defaultDate={defaultDate} />;
}

function HealthForm({ item, defaultDate }: { item: HealthExpense | null; defaultDate: string }) {
  const db = useSQLiteContext();
  const [label, setLabel] = useState(item?.label ?? '');
  const [amount, setAmount] = useState(centsToInput(item?.amount_cents));
  const [refund, setRefund] = useState(centsToInput(item?.refund_cents));
  const [date, setDate] = useState(item?.date ?? defaultDate);
  const [settled, setSettled] = useState(item?.settled === 1);
  const [saving, setSaving] = useState(false);

  const amountCents = parseAmountToCents(amount);
  const refundCents = refund.trim() ? parseAmountToCents(refund) : 0;

  const save = async () => {
    if (!label.trim()) {
      notify('Libellé manquant', 'Ex : Pharmacie, Docteur, Dentiste…');
      return;
    }
    if (!amountCents || amountCents <= 0 || refundCents === null) {
      notify('Montant invalide', 'Vérifie le montant avancé et le remboursement.');
      return;
    }
    setSaving(true);
    await saveHealthExpense(db, { id: item?.id, label: label.trim(), date, amountCents, refundCents, settled });
    router.back();
  };

  const remove = () => {
    if (!item) return;
    confirmAction({
      title: 'Supprimer',
      message: `Supprimer « ${item.label} » ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await deleteHealthExpense(db, item.id);
          router.back();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={item ? 'Frais de santé' : 'Nouveau frais de santé'} />
      <FormField label="Libellé" value={label} onChangeText={setLabel} placeholder="Pharmacie, Docteur…" />
      <AmountField label="Montant avancé" value={amount} onChangeText={setAmount} placeholder="0,00" />
      <AmountField label="Remboursement attendu" value={refund} onChangeText={setRefund} placeholder="0,00" />
      {amountCents && refundCents !== null ? (
        <Caption>Reste à charge : {formatCents(Math.max(0, amountCents - refundCents))}</Caption>
      ) : null}
      <View style={styles.chips}>
        <Chip label="Remboursement en attente" selected={!settled} onPress={() => setSettled(false)} />
        <Chip label="Remboursé" selected={settled} onPress={() => setSettled(true)} />
      </View>
      <DatePickerGrid value={date} onChange={setDate} />
      <Button label={item ? 'Enregistrer' : 'Ajouter'} onPress={() => void save()} loading={saving} />
      {item ? <Button label="Supprimer" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
