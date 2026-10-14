import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { Chip } from '@/src/components/ui/Chip';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { MonthSwitcher } from '@/src/components/ui/MonthSwitcher';
import { Screen } from '@/src/components/ui/Screen';
import { Caption, Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  FREQUENCY_LABELS,
  getFixedItem,
  saveFixedItem,
  stopFixedItem,
  type FixedItem,
  type FixedKind,
  type Frequency,
} from '@/src/features/fixed/repository';
import { useSelectedMonth } from '@/src/store/month';
import { spacing, useTheme } from '@/src/theme';
import { monthKeyLabel, type MonthKey } from '@/src/utils/dates';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { centsToInput, parseAmountToCents } from '@/src/utils/money';

const FREQUENCIES: Frequency[] = ['monthly', 'quarterly', 'yearly', 'once'];

const ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'home-outline',
  'flash-outline',
  'water-outline',
  'call-outline',
  'wifi-outline',
  'tv-outline',
  'musical-notes-outline',
  'car-outline',
  'shield-checkmark-outline',
  'school-outline',
  'barbell-outline',
  'receipt-outline',
  'cash-outline',
  'briefcase-outline',
  'people-outline',
  'gift-outline',
];

export default function FixedModal() {
  const params = useLocalSearchParams<{ id?: string; month?: string; kind?: string }>();
  const globalMonth = useSelectedMonth((s) => s.month);
  const id = params.id ? Number(params.id) : null;
  const { data: item } = useLiveQuery(async (db) => (id ? getFixedItem(db, id) : null), [id]);
  if (id && !item) return <Screen />;
  return (
    <FixedForm
      item={item ?? null}
      month={params.month ?? globalMonth}
      kind={params.kind === 'income' ? 'income' : 'charge'}
    />
  );
}

function FixedForm({ item, month, kind: initialKind }: { item: FixedItem | null; month: MonthKey; kind: FixedKind }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [kind, setKind] = useState<FixedKind>(item?.kind ?? initialKind);
  const [icon, setIcon] = useState<string | null>(item?.icon ?? null);
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(centsToInput(item?.amount_cents));
  const [day, setDay] = useState(item ? String(item.day) : '1');
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? 'monthly');
  const [startMonth, setStartMonth] = useState<MonthKey>(item?.start_month ?? month);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      notify('Nom manquant', kind === 'charge' ? 'Ex : Loyer, Électricité, Netflix…' : 'Ex : Salaire, CAF…');
      return;
    }
    const cents = parseAmountToCents(amount);
    if (!cents || cents <= 0) {
      notify('Montant invalide', 'Saisis un montant, par exemple 650.');
      return;
    }
    const dayNumber = Number(day);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      notify('Jour invalide', 'Le jour doit être compris entre 1 et 31.');
      return;
    }
    setSaving(true);
    await saveFixedItem(db, {
      id: item?.id,
      kind,
      name: name.trim(),
      amountCents: cents,
      day: dayNumber,
      frequency,
      startMonth,
      icon,
    });
    router.back();
  };

  const stop = () => {
    if (!item) return;
    const deletes = item.start_month >= month;
    const label = monthKeyLabel(month);
    confirmAction({
      title: deletes ? 'Supprimer' : 'Arrêter',
      message: deletes
        ? `Supprimer « ${item.name} » ?`
        : `« ${item.name} » ne sera plus compté à partir de ${label}. Les mois précédents restent inchangés.`,
      confirmLabel: deletes ? 'Supprimer' : 'Arrêter',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await stopFixedItem(db, item, month);
          router.back();
        })();
      },
    });
  };

  const isCharge = kind === 'charge';

  return (
    <Screen>
      <ModalHeader title={item ? 'Modifier' : isCharge ? 'Nouvelle charge fixe' : 'Nouveau revenu'} />

      <View style={styles.chips}>
        <Chip label="Charge fixe" selected={isCharge} onPress={() => setKind('charge')} />
        <Chip label="Revenu" selected={!isCharge} onPress={() => setKind('income')} />
      </View>

      <FormField
        label="Nom"
        value={name}
        onChangeText={setName}
        placeholder={isCharge ? 'Loyer, électricité, assurance…' : 'Salaire, prime, CAF…'}
      />
      <AmountField label="Montant" value={amount} onChangeText={setAmount} placeholder="0,00" />
      <FormField
        label={isCharge ? 'Jour du prélèvement' : 'Jour du versement'}
        value={day}
        onChangeText={setDay}
        keyboardType="number-pad"
        placeholder="1"
      />

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Fréquence</Eyebrow>
        <View style={styles.chips}>
          {FREQUENCIES.map((value) => (
            <Chip
              key={value}
              label={FREQUENCY_LABELS[value]}
              selected={frequency === value}
              onPress={() => setFrequency(value)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>{frequency === 'once' ? 'Mois' : 'À partir de'}</Eyebrow>
        <MonthSwitcher month={startMonth} onChange={setStartMonth} />
        {frequency === 'quarterly' || frequency === 'yearly' ? (
          <Caption>
            Revient {frequency === 'quarterly' ? 'tous les 3 mois' : 'chaque année'} à partir de ce mois-là.
          </Caption>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Icône</Eyebrow>
        <View style={styles.chips}>
          {ICONS.map((value) => {
            const selected = icon === value;
            return (
              <Pressable
                key={value}
                onPress={() => setIcon(selected ? null : value)}
                accessibilityRole="button"
                accessibilityLabel={value}
                accessibilityState={{ selected }}
                style={[
                  styles.icon,
                  { backgroundColor: selected ? theme.colors.secondary : theme.colors.card, borderColor: theme.colors.border },
                ]}
              >
                <Ionicons name={value} size={20} color={selected ? theme.colors.onAccent : theme.colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button label={item ? 'Enregistrer' : 'Ajouter'} onPress={() => void save()} loading={saving} />
      {item ? (
        <Button
          label={item.start_month >= month ? 'Supprimer' : `Arrêter à partir de ${monthKeyLabel(month)}`}
          variant="danger"
          onPress={stop}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
