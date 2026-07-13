import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { AmountField, FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import {
  createAccount,
  deleteAccount,
  listAccountsWithBalance,
  updateAccount,
} from '@/src/features/savings/repository';
import { categoryPalette, fonts, spacing, useTheme } from '@/src/theme';
import { confirmAction, notify } from '@/src/utils/dialogs';
import { parseAmountToCents } from '@/src/utils/money';

const ACCOUNT_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'wallet-outline',
  'cash-outline',
  'business-outline',
  'shield-checkmark-outline',
  'home-outline',
  'car-outline',
  'airplane-outline',
  'school-outline',
  'gift-outline',
  'heart-outline',
  'trending-up-outline',
  'diamond-outline',
];

const ACCOUNT_COLORS = categoryPalette;

export default function NewAccountScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    icon?: string;
    color?: string;
    initial?: string;
    target?: string;
    monthly?: string;
  }>();
  const editingId = params.id ? Number(params.id) : null;

  const centsToInput = (v?: string) => (v && Number(v) > 0 ? String(Number(v) / 100).replace('.', ',') : '');

  const [name, setName] = useState(params.name ?? '');
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>(
    (params.icon as keyof typeof Ionicons.glyphMap) ?? 'wallet-outline',
  );
  // Couleur par défaut : la teinte suivante de la palette (ordre fixe), pour
  // que chaque compte reçoive sa propre couleur sans choix manuel.
  const { data: existingAccounts } = useLiveQuery((db) => listAccountsWithBalance(db));
  const [pickedColor, setPickedColor] = useState<string | null>(params.color ?? null);
  const color =
    pickedColor ?? ACCOUNT_COLORS[(existingAccounts?.length ?? 0) % ACCOUNT_COLORS.length];
  const setColor = setPickedColor;
  const [initial, setInitial] = useState(centsToInput(params.initial));
  const [target, setTarget] = useState(centsToInput(params.target));
  const [monthly, setMonthly] = useState(centsToInput(params.monthly));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      notify('Nom manquant', 'Donnez un nom à ce compte (ex : Livret A).');
      return;
    }
    const initialCents = initial.trim() ? parseAmountToCents(initial) : 0;
    if (initialCents === null) {
      notify('Valeur de départ invalide', 'Saisissez un montant valide, par exemple 1500.');
      return;
    }
    const targetCents = target.trim() ? parseAmountToCents(target) : null;
    if (target.trim() && (targetCents === null || targetCents <= 0)) {
      notify('Objectif invalide', 'L’objectif doit être un montant valide.');
      return;
    }
    const monthlyCents = monthly.trim() ? parseAmountToCents(monthly) : null;
    if (monthly.trim() && (monthlyCents === null || monthlyCents <= 0)) {
      notify('Virement mensuel invalide', 'Le virement mensuel prévu doit être un montant valide.');
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), icon, color, initialCents, targetCents, monthlyCents };
    if (editingId) {
      await updateAccount(db, { id: editingId, ...payload });
    } else {
      await createAccount(db, payload);
    }
    router.back();
  };

  const remove = () => {
    if (!editingId) return;
    confirmAction({
      title: 'Supprimer le compte',
      message: `Supprimer « ${name} » et tout son historique de virements ? La valeur de départ sera aussi perdue.`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await deleteAccount(db, editingId);
          router.back();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={editingId ? 'Modifier le compte' : 'Nouveau compte'} />

      <FormField label="Nom du compte" value={name} onChangeText={setName} placeholder="Livret A, LDDS, PEL…" autoFocus />
      <AmountField
        label="Valeur de départ (épargne déjà cumulée)"
        value={initial}
        onChangeText={setInitial}
        placeholder="1 500"
      />
      <AmountField
        label="Virement mensuel prévu (optionnel)"
        value={monthly}
        onChangeText={setMonthly}
        placeholder="150"
      />
      <AmountField label="Objectif à atteindre (optionnel)" value={target} onChangeText={setTarget} placeholder="10 000" />

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Icône</Text>
        <View style={styles.optionsRow}>
          {ACCOUNT_ICONS.map((value) => (
            <Pressable
              key={value}
              onPress={() => setIcon(value)}
              style={[
                styles.iconOption,
                {
                  backgroundColor: icon === value ? `${color}22` : theme.colors.card,
                  borderColor: icon === value ? color : theme.colors.border,
                },
              ]}
            >
              <Ionicons name={value} size={22} color={icon === value ? color : theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Couleur</Text>
        <View style={styles.optionsRow}>
          {ACCOUNT_COLORS.map((value) => (
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

      <Button label={editingId ? 'Enregistrer' : 'Créer le compte'} onPress={() => void save()} loading={saving} />
      {editingId ? <Button label="Supprimer le compte" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
