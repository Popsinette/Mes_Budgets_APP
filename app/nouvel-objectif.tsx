import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { createSavingsGoal } from '@/src/features/savings/repository';
import { palette, spacing, useTheme } from '@/src/theme';
import { parseAmountToCents } from '@/src/utils/money';

const GOAL_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'airplane-outline',
  'car-outline',
  'home-outline',
  'gift-outline',
  'school-outline',
  'medkit-outline',
  'shield-checkmark-outline',
  'flag-outline',
];

const GOAL_COLORS = [
  palette.violet,
  palette.mint,
  palette.blue,
  palette.pink,
  palette.orange,
  palette.teal,
];

export default function NewSavingsGoalScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [monthly, setMonthly] = useState('');
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>('flag-outline');
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const targetCents = parseAmountToCents(target);
    const monthlyCents = monthly.trim() ? parseAmountToCents(monthly) : null;
    if (!name.trim()) {
      Alert.alert('Nom manquant', 'Donnez un nom à cet objectif (ex : Vacances).');
      return;
    }
    if (!targetCents || targetCents <= 0) {
      Alert.alert('Objectif invalide', 'Saisissez le montant à atteindre, par exemple 2000.');
      return;
    }
    if (monthly.trim() && (!monthlyCents || monthlyCents <= 0)) {
      Alert.alert('Versement invalide', 'Le versement mensuel prévu est invalide.');
      return;
    }
    setSaving(true);
    await createSavingsGoal(db, { name: name.trim(), targetCents, monthlyCents, icon, color });
    router.back();
  };

  return (
    <Screen>
      <ModalHeader title="Nouvel objectif" />

      <FormField label="Nom" value={name} onChangeText={setName} placeholder="Vacances, voiture…" autoFocus />
      <AmountField label="Montant à atteindre" value={target} onChangeText={setTarget} placeholder="2 000" />
      <AmountField
        label="Versement mensuel prévu (optionnel)"
        value={monthly}
        onChangeText={setMonthly}
        placeholder="150"
      />

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Icône</Text>
        <View style={styles.optionsRow}>
          {GOAL_ICONS.map((name) => (
            <Pressable
              key={name}
              onPress={() => setIcon(name)}
              style={[
                styles.iconOption,
                {
                  backgroundColor: icon === name ? `${color}22` : theme.colors.card,
                  borderColor: icon === name ? color : theme.colors.border,
                },
              ]}
            >
              <Ionicons name={name} size={22} color={icon === name ? color : theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Couleur</Text>
        <View style={styles.optionsRow}>
          {GOAL_COLORS.map((value) => (
            <Pressable
              key={value}
              onPress={() => setColor(value)}
              style={[
                styles.colorOption,
                { backgroundColor: value, borderWidth: color === value ? 3 : 0, borderColor: theme.colors.text },
              ]}
            />
          ))}
        </View>
      </View>

      <Button label="Créer l’objectif" onPress={() => void save()} loading={saving} />
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
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconOption: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  colorOption: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
});
