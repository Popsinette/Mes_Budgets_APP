import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryPicker } from '@/src/components/ui/CategoryPicker';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Eyebrow } from '@/src/components/ui/Text';
import { createBill, deleteBill, updateBill } from '@/src/features/bills/repository';
import { spacing } from '@/src/theme';
import { parseAmountToCents } from '@/src/utils/money';

export default function NewBillScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    billId?: string;
    name?: string;
    amount?: string;
    dueDay?: string;
    categoryId?: string;
  }>();
  const editingId = params.billId ? Number(params.billId) : null;

  const [name, setName] = useState(params.name ?? '');
  const [amount, setAmount] = useState(
    params.amount ? String(Number(params.amount) / 100).replace('.', ',') : '',
  );
  const [dueDay, setDueDay] = useState(params.dueDay ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(
    params.categoryId ? Number(params.categoryId) : null,
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountCents = parseAmountToCents(amount);
    const day = Number.parseInt(dueDay, 10);
    if (!name.trim()) {
      notify('Nom manquant', 'Donnez un nom à cette facture (ex : Loyer).');
      return;
    }
    if (!amountCents || amountCents <= 0) {
      notify('Montant invalide', 'Saisissez un montant valide, par exemple 45,99.');
      return;
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      notify('Échéance invalide', 'Le jour d’échéance doit être entre 1 et 31.');
      return;
    }
    setSaving(true);
    if (editingId) {
      await updateBill(db, { id: editingId, name: name.trim(), amountCents, dueDay: day, categoryId });
    } else {
      await createBill(db, { name: name.trim(), amountCents, dueDay: day, categoryId });
    }
    router.back();
  };

  const remove = () => {
    if (!editingId) return;
    confirmAction({
      title: 'Supprimer la facture',
      message: `Supprimer « ${name} » définitivement ? Les dépenses des mois déjà pointés sont conservées.`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await deleteBill(db, editingId);
          router.back();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={editingId ? 'Modifier la facture' : 'Nouvelle facture'} />
      <Body tone="muted" size={13.5}>
        Facture récurrente mensuelle : loyer, électricité, internet, abonnements…
      </Body>

      <FormField label="Nom" value={name} onChangeText={setName} placeholder="Loyer, EDF, Netflix…" autoFocus />
      <AmountField label="Montant mensuel" value={amount} onChangeText={setAmount} placeholder="45,99" />
      <FormField
        label="Jour d’échéance (1 à 31)"
        value={dueDay}
        onChangeText={setDueDay}
        placeholder="5"
        keyboardType="number-pad"
      />

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Catégorie (optionnel)</Eyebrow>
        <CategoryPicker selectedId={categoryId} onSelect={(c) => setCategoryId(c.id === categoryId ? null : c.id)} />
      </View>

      <Button label="Enregistrer" onPress={() => void save()} loading={saving} />
      {editingId ? <Button label="Supprimer la facture" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}
