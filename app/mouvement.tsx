import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { Chip } from '@/src/components/ui/Chip';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Body, Caption, Eyebrow, Money } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { closeWeek } from '@/src/features/envelopes/repository';
import { addMove, listPots, type PotWithBalance } from '@/src/features/savings/repository';
import { radius, spacing, useTheme } from '@/src/theme';
import { currentMonthKey, todayIso, weekLabel } from '@/src/utils/dates';
import { notify } from '@/src/utils/dialogs';
import { centsToInput, parseAmountToCents } from '@/src/utils/money';

/**
 * Dépôt ou retrait sur une poche. Avec `week` + `amount` : mise de côté du
 * reste d'une semaine terminée (la semaine est alors soldée).
 */
export default function MoveModal() {
  const params = useLocalSearchParams<{ potId?: string; type?: string; week?: string; amount?: string }>();
  const { data: pots } = useLiveQuery((db) => listPots(db, currentMonthKey()));
  if (!pots) return <Screen />;
  return (
    <MoveForm
      pots={pots}
      potId={params.potId ? Number(params.potId) : null}
      withdraw={params.type === 'withdraw'}
      week={params.week ?? null}
      amount={params.amount ? Number(params.amount) : null}
    />
  );
}

function MoveForm({
  pots,
  potId,
  withdraw: initialWithdraw,
  week,
  amount: initialAmount,
}: {
  pots: PotWithBalance[];
  potId: number | null;
  withdraw: boolean;
  week: string | null;
  amount: number | null;
}) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [selected, setSelected] = useState<number | null>(potId ?? pots[0]?.id ?? null);
  const [withdraw, setWithdraw] = useState(initialWithdraw);
  const [amount, setAmount] = useState(centsToInput(initialAmount));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const cents = parseAmountToCents(amount);
    if (!cents || cents <= 0) {
      notify('Montant invalide', 'Saisis un montant, par exemple 50.');
      return;
    }
    if (!selected) {
      notify('Poche manquante', 'Crée d’abord une poche d’épargne.');
      return;
    }
    setSaving(true);
    if (week) {
      await closeWeek(db, { week, potId: selected, amountCents: cents, date: todayIso() });
    } else {
      await addMove(db, {
        potId: selected,
        amountCents: withdraw ? -cents : cents,
        date: todayIso(),
        note: note.trim() || null,
      });
    }
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title={week ? 'Mettre de côté' : withdraw ? 'Retirer' : 'Ajouter à l’épargne'} />
      {week ? (
        <Caption>Le reste de la semaine du {weekLabel(week)} rejoint ton épargne.</Caption>
      ) : (
        <View style={styles.row}>
          <Chip label="Dépôt" selected={!withdraw} onPress={() => setWithdraw(false)} />
          <Chip label="Retrait" selected={withdraw} onPress={() => setWithdraw(true)} />
        </View>
      )}

      <AmountField label="Montant" value={amount} onChangeText={setAmount} placeholder="0,00" autoFocus={!week} />

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Poche</Eyebrow>
        {pots.map((pot) => {
          const isSelected = pot.id === selected;
          return (
            <Pressable
              key={pot.id}
              onPress={() => setSelected(pot.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={pot.name}
              style={[
                styles.pot,
                {
                  backgroundColor: isSelected ? `${pot.color}22` : theme.colors.card,
                  borderColor: isSelected ? pot.color : theme.colors.border,
                },
              ]}
            >
              <CategoryIcon icon={pot.icon} color={pot.color} size={34} />
              <Body weight="semibold" style={{ flex: 1 }}>
                {pot.name}
              </Body>
              <Money cents={pot.balance_cents} size={14} tone="muted" />
            </Pressable>
          );
        })}
      </View>

      {!week ? (
        <FormField label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Prime, vacances…" />
      ) : null}

      <Button label="Valider" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
