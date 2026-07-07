import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { notify } from '@/src/utils/dialogs';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryPicker } from '@/src/components/ui/CategoryPicker';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { addTransaction, type TransactionType } from '@/src/features/transactions/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, todayIso } from '@/src/utils/dates';
import { parseAmountToCents } from '@/src/utils/money';
import { Pressable } from 'react-native';

export default function NewTransactionScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountCents = parseAmountToCents(amount);
    if (!amountCents || amountCents <= 0) {
      notify('Montant invalide', 'Saisissez un montant valide, par exemple 12,50.');
      return;
    }
    if (!label.trim()) {
      notify('Libellé manquant', 'Donnez un nom à cette opération.');
      return;
    }
    setSaving(true);
    await addTransaction(db, {
      categoryId: type === 'expense' ? categoryId : null,
      label: label.trim(),
      amountCents,
      type,
      date: todayIso(),
      month: currentMonthKey(),
      note: note.trim() || undefined,
    });
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title="Nouvelle opération" />

      <View style={[styles.typeToggle, { backgroundColor: theme.colors.cardMuted }]}>
        {(
          [
            ['expense', 'Dépense'],
            ['income', 'Revenu'],
          ] as Array<[TransactionType, string]>
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setType(value)}
            style={[
              styles.typeOption,
              type === value && {
                backgroundColor: value === 'expense' ? theme.colors.danger : theme.colors.success,
              },
            ]}
          >
            <Text
              style={[
                styles.typeLabel,
                { color: type === value ? '#FFFFFF' : theme.colors.textMuted },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <AmountField label="Montant" value={amount} onChangeText={setAmount} placeholder="0,00" autoFocus />
      <FormField
        label="Libellé"
        value={label}
        onChangeText={setLabel}
        placeholder={type === 'expense' ? 'Courses, essence…' : 'Salaire, remboursement…'}
      />

      {type === 'expense' ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Catégorie</Text>
          <CategoryPicker selectedId={categoryId} onSelect={(c) => setCategoryId(c.id)} />
        </View>
      ) : null}

      <FormField label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Détail…" />

      <Button label="Enregistrer" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  typeToggle: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
  },
  typeOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md - 4,
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
