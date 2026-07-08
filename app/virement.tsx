import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
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
        <Text style={{ color: theme.colors.textMuted }}>
          Créez d’abord un compte d’épargne pour pouvoir y faire un virement.
        </Text>
        <Button label="Créer un compte" onPress={() => router.replace('/nouveau-compte')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ModalHeader title="Nouveau virement" />
      <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>
        Virement d’épargne pour {monthKeyLabel(month)}.
      </Text>

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Compte d’épargne</Text>
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
                <Text style={[styles.accountName, { color: theme.colors.text }]} numberOfLines={1}>
                  {account.name}
                </Text>
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
        <View style={{ flex: 1 }}>
          <Text style={[styles.doneLabel, { color: theme.colors.text }]}>Virement déjà effectué</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 16 }}>
            {done
              ? 'Compté dans votre épargne réelle et le reste à vivre réel.'
              : 'Simplement prévu : compté dans le prévisionnel seulement.'}
          </Text>
        </View>
        <Switch value={done} onValueChange={setDone} trackColor={{ true: theme.colors.success }} />
      </View>

      <FormField label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Prime, virement auto…" />

      {selected ? (
        <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
          Solde actuel de « {selected.name} » : {formatCents(selected.real_cents)}
        </Text>
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
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
  accountName: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 120,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  doneLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
});
