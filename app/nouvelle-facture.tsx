import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryPicker } from '@/src/components/ui/CategoryPicker';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { createBill } from '@/src/features/bills/repository';
import { spacing, useTheme } from '@/src/theme';
import { parseAmountToCents } from '@/src/utils/money';

export default function NewBillScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountCents = parseAmountToCents(amount);
    const day = Number.parseInt(dueDay, 10);
    if (!name.trim()) {
      Alert.alert('Nom manquant', 'Donnez un nom à cette facture (ex : Loyer).');
      return;
    }
    if (!amountCents || amountCents <= 0) {
      Alert.alert('Montant invalide', 'Saisissez un montant valide, par exemple 45,99.');
      return;
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      Alert.alert('Échéance invalide', 'Le jour d’échéance doit être entre 1 et 31.');
      return;
    }
    setSaving(true);
    await createBill(db, { name: name.trim(), amountCents, dueDay: day, categoryId });
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title="Nouvelle facture" />
      <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>
        Facture récurrente mensuelle : loyer, électricité, internet, abonnements…
      </Text>

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
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 13,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          Catégorie (optionnel)
        </Text>
        <CategoryPicker selectedId={categoryId} onSelect={(c) => setCategoryId(c.id === categoryId ? null : c.id)} />
      </View>

      <Button label="Enregistrer" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}
