import { router, useLocalSearchParams } from 'expo-router';
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
import { useSelectedMonth } from '@/src/store/month';
import { fonts, radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, isoDayInMonth, monthKeyLabel, todayIso } from '@/src/utils/dates';
import { parseAmountToCents } from '@/src/utils/money';
import { Pressable } from 'react-native';

export default function NewTransactionScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ type?: string }>();
  // L'opération se range dans le mois affiché (sélecteur global) : on peut
  // saisir un revenu prévisionnel d'août en préparant ses budgets depuis juillet.
  const month = useSelectedMonth((s) => s.month);
  const isCurrentMonth = month === currentMonthKey();

  const [type, setType] = useState<TransactionType>(params.type === 'income' ? 'income' : 'expense');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  // Par défaut « en attente » : on saisit l'opération dès qu'on la fait, puis on
  // la pointe quand elle passe sur le compte.
  const [cleared, setCleared] = useState(false);
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
      // Mois courant : datée d'aujourd'hui. Autre mois : datée du même jour
      // du mois affiché (borné à sa fin), pour rester dans ce mois.
      date: isCurrentMonth ? todayIso() : isoDayInMonth(month, new Date().getDate()),
      month,
      note: note.trim() || undefined,
      cleared,
    });
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title="Nouvelle opération" />
      {!isCurrentMonth ? (
        <View style={[styles.monthBanner, { backgroundColor: theme.colors.warningSoft }]}>
          <Text style={[styles.monthBannerText, { color: theme.colors.warning }]}>
            Sera enregistrée en {monthKeyLabel(month)} (mois affiché)
          </Text>
        </View>
      ) : null}

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

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>État</Text>
        <View style={[styles.typeToggle, { backgroundColor: theme.colors.cardMuted }]}>
          {(
            [
              [false, 'À venir'],
              [true, 'Déjà passée'],
            ] as Array<[boolean, string]>
          ).map(([value, optionLabel]) => (
            <Pressable
              key={String(value)}
              onPress={() => setCleared(value)}
              style={[
                styles.typeOption,
                cleared === value && { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.typeLabel,
                  { color: cleared === value ? theme.colors.onAccent : theme.colors.textMuted },
                ]}
              >
                {optionLabel}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 16 }}>
          « À venir » : en attente sur le compte, comptée dans le prévisionnel. Pointez-la depuis
          Opérations quand elle passe.
        </Text>
      </View>

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
    fontFamily: fonts.bodySemibold,
    fontSize: 14.5,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  monthBanner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  monthBannerText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    textAlign: 'center',
  },
});
