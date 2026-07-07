import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Screen } from '@/src/components/ui/Screen';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { addSavingsEntry, listGoalsWithProgress } from '@/src/features/savings/repository';
import { spacing, useTheme } from '@/src/theme';
import { todayIso } from '@/src/utils/dates';
import { formatCents, parseAmountToCents } from '@/src/utils/money';

export default function AddSavingsEntryScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ goalId?: string }>();
  const goalId = Number(params.goalId);

  const { data: goals } = useLiveQuery((db) => listGoalsWithProgress(db));
  const goal = (goals ?? []).find((g) => g.id === goalId);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountCents = parseAmountToCents(amount);
    if (!goal) return;
    if (!amountCents || amountCents === 0) {
      notify('Montant invalide', 'Saisissez le montant du versement, par exemple 150.');
      return;
    }
    setSaving(true);
    await addSavingsEntry(db, {
      goalId: goal.id,
      amountCents,
      date: todayIso(),
      note: note.trim() || undefined,
    });
    router.back();
  };

  if (!goal) {
    return (
      <Screen>
        <ModalHeader title="Verser" />
        <Text style={{ color: theme.colors.textMuted }}>Objectif introuvable.</Text>
      </Screen>
    );
  }

  const ratio = goal.target_cents > 0 ? goal.saved_cents / goal.target_cents : 0;

  return (
    <Screen>
      <ModalHeader title={`Verser sur « ${goal.name} »`} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <CategoryIcon icon={goal.icon} color={goal.color} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
            {formatCents(goal.saved_cents)} / {formatCents(goal.target_cents)}
          </Text>
          <ProgressBar ratio={ratio} color={goal.color} />
        </View>
      </View>

      <AmountField
        label="Montant du versement"
        value={amount}
        onChangeText={setAmount}
        placeholder={goal.monthly_cents ? String(goal.monthly_cents / 100) : '150'}
        autoFocus
      />
      <FormField label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Prime, virement…" />

      <Button label="Verser" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}
