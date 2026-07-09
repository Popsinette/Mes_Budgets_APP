import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { addTransfer, listAccountsWithBalance } from '@/src/features/savings/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, monthKeyLabel, todayIso } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { formatCents, parseAmountToCents } from '@/src/utils/money';

export default function NewTransferScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ accountId?: string; month?: string }>();
  const month = params.month || currentMonthKey();

  const { data: accounts } = useLiveQuery((db) => listAccountsWithBalance(db));
  const [accountId, setAccountId] = useState<number | null>(params.accountId ? Number(params.accountId) : null);
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = (accounts ?? []).find((a) => a.id === accountId) ?? null;

  // Pré-remplit le montant avec le virement mensuel prévu du compte choisi.
  const pickAccount = (id: number) => {
    setAccountId(id);
    const acc = (accounts ?? []).find((a) => a.id === id);
    if (acc?.monthly_cents && !amount.trim()) {
      setAmount(String(acc.monthly_cents / 100).replace('.', ','));
    }
  };

  const save = async () => {
    if (!accountId) {
      notify('Compte manquant', 'Choisissez le compte d’épargne à créditer.');
      return;
    }
    const amountCents = parseAmountToCents(amount);
    if (!amountCents || amountCents <= 0) {
      notify('Montant invalide', 'Saisissez le montant du virement, par exemple 150.');
      return;
    }
    setSaving(true);
    await addTransfer(db, { accountId, amountCents, month, date: todayIso(), done, note: note.trim() || undefined });
    router.back();
  };

  if ((accounts ?? []).length === 0) {
    return (
      <Screen>
        <ModalHeader title="Nouveau virement" />
        <Body tone="muted">
          Créez d’abord un compte d’épargne pour pouvoir y faire un virement.
        </Body>
        <Button label="Créer un compte" onPress={() => router.replace('/nouveau-compte')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader title="Nouveau virement" />
      <Body tone="muted" size={13.5}>
        Virement d’épargne pour {monthKeyLabel(month)}.
      </Body>

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Compte d’épargne</Eyebrow>
        <View style={styles.accounts}>
          {(accounts ?? []).map((account) => {
            const isSel = account.id === accountId;
            return (
              <Pressable
                key={account.id}
                onPress={() => pickAccount(account.id)}
                style={[
                  styles.accountChip,
                  {
                    backgroundColor: isSel ? `${account.color}22` : theme.colors.card,
                    borderColor: isSel ? account.color : theme.colors.border,
                  },
                ]}
              >
                <CategoryIcon icon={account.icon} color={account.color} size={30} />
                <Body weight="semibold" size={14} numberOfLines={1} style={{ maxWidth: 120 }}>
                  {account.name}
                </Body>
              </Pressable>
            );
          })}
        </View>
      </View>

      <AmountField
        label="Montant du virement"
        value={amount}
        onChangeText={setAmount}
        placeholder={selected?.monthly_cents ? String(selected.monthly_cents / 100) : '150'}
      />

      <View style={[styles.doneRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="semibold">Virement déjà effectué</Body>
          <Caption>
            {done
              ? 'Compté dans votre épargne réelle et le reste à vivre réel.'
              : 'Simplement prévu : compté dans le prévisionnel seulement.'}
          </Caption>
        </View>
        <Switch value={done} onValueChange={setDone} trackColor={{ true: theme.colors.success }} />
      </View>

      <FormField label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Prime, virement auto…" />

      {selected ? (
        <Caption>
          Solde actuel de « {selected.name} » : {formatCents(selected.real_cents)}
        </Caption>
      ) : null}

      <Button
        label={done ? 'Enregistrer le virement' : 'Planifier le virement'}
        onPress={() => void save()}
        loading={saving}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  accounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
