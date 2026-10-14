import type { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppearancePicker } from '@/src/components/ui/AppearancePicker';
import { Button } from '@/src/components/ui/Button';
import { Chip } from '@/src/components/ui/Chip';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { Eyebrow } from '@/src/components/ui/Text';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  deletePot,
  getPot,
  listPots,
  POT_KIND_LABELS,
  savePot,
  type Pot,
  type PotKind,
} from '@/src/features/savings/repository';
import { categoryPalette, spacing } from '@/src/theme';
import { currentMonthKey } from '@/src/utils/dates';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { centsToInput, parseAmountToCents } from '@/src/utils/money';

const ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'shield-checkmark-outline',
  'wallet-outline',
  'airplane-outline',
  'car-outline',
  'home-outline',
  'gift-outline',
  'construct-outline',
  'school-outline',
  'heart-outline',
  'paw-outline',
  'trending-up-outline',
  'diamond-outline',
];

export default function PotModal() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;
  const { data: pot } = useLiveQuery(async (db) => (id ? getPot(db, id) : null), [id]);
  const { data: all } = useLiveQuery((db) => listPots(db, currentMonthKey()));
  if (!all || (id && !pot)) return <Screen />;
  return <PotForm pot={pot ?? null} count={all.length} />;
}

function PotForm({ pot, count }: { pot: Pot | null; count: number }) {
  const db = useSQLiteContext();
  const [name, setName] = useState(pot?.name ?? '');
  const [kind, setKind] = useState<PotKind>(pot?.kind ?? 'projet');
  const [initial, setInitial] = useState(centsToInput(pot?.initial_cents));
  const [monthly, setMonthly] = useState(centsToInput(pot?.monthly_cents));
  const [target, setTarget] = useState(centsToInput(pot?.target_cents));
  const [icon, setIcon] = useState(pot?.icon ?? 'wallet-outline');
  const [color, setColor] = useState<string>(pot?.color ?? categoryPalette[(count + 7) % categoryPalette.length]);
  const [saving, setSaving] = useState(false);

  const optional = (input: string) => (input.trim() ? parseAmountToCents(input) : 0);

  const save = async () => {
    if (!name.trim()) {
      notify('Nom manquant', 'Ex : Fonds d’urgence, Vacances, Voiture…');
      return;
    }
    const initialCents = optional(initial);
    const monthlyCents = optional(monthly);
    const targetCents = optional(target);
    if (initialCents === null || monthlyCents === null || targetCents === null) {
      notify('Montant invalide', 'Vérifie les montants saisis (ex : 1500).');
      return;
    }
    setSaving(true);
    await savePot(db, {
      id: pot?.id,
      name: name.trim(),
      kind,
      icon,
      color,
      initialCents,
      monthlyCents: monthlyCents || null,
      targetCents: targetCents || null,
    });
    router.back();
  };

  const remove = () => {
    if (!pot) return;
    confirmAction({
      title: 'Supprimer la poche',
      message: `Supprimer « ${pot.name} » et tout son historique ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await deletePot(db, pot.id);
          router.dismissAll();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={pot ? 'Modifier la poche' : 'Nouvelle poche'} />
      <FormField label="Nom" value={name} onChangeText={setName} placeholder="Fonds d’urgence, Vacances…" />
      <View style={{ gap: spacing.sm }}>
        <Eyebrow>Type</Eyebrow>
        <View style={styles.chips}>
          {(['securite', 'projet'] as const).map((value) => (
            <Chip key={value} label={POT_KIND_LABELS[value]} selected={kind === value} onPress={() => setKind(value)} />
          ))}
        </View>
      </View>
      <AmountField label="Déjà épargné" value={initial} onChangeText={setInitial} placeholder="0" />
      <AmountField label="Versement mensuel programmé (optionnel)" value={monthly} onChangeText={setMonthly} placeholder="50" />
      <AmountField label="Objectif (optionnel)" value={target} onChangeText={setTarget} placeholder="3 000" />
      <AppearancePicker icons={ICONS} icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
      <Button label={pot ? 'Enregistrer' : 'Créer la poche'} onPress={() => void save()} loading={saving} />
      {pot ? <Button label="Supprimer la poche" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
