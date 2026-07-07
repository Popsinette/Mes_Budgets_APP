import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryPicker } from '@/src/components/ui/CategoryPicker';
import { AmountField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { upsertBudget } from '@/src/features/budgets/repository';
import { spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel } from '@/src/utils/dates';
import { parseAmountToCents } from '@/src/utils/money';

export default function NewBudgetScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ month?: string }>();
  const month = typeof params.month === 'string' && params.month ? params.month : currentMonthKey();

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountCents = parseAmountToCents(amount);
    if (!categoryId) {
      notify('Catégorie manquante', 'Choisissez la catégorie à budgéter.');
      return;
    }
    if (!amountCents || amountCents <= 0) {
      notify('Montant invalide', 'Saisissez un montant valide, par exemple 300.');
      return;
    }
    setSaving(true);
    await upsertBudget(db, { categoryId, month, amountCents });
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title="Nouveau budget" />
      <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>
        Budget mensuel pour {monthKeyLabel(month)} — si un budget existe déjà pour cette catégorie, il sera
        remplacé.
      </Text>

      <AmountField label="Montant mensuel" value={amount} onChangeText={setAmount} placeholder="300" autoFocus />

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
          Catégorie
        </Text>
        <CategoryPicker selectedId={categoryId} onSelect={(c) => setCategoryId(c.id)} />
      </View>

      <Button label="Enregistrer" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}
