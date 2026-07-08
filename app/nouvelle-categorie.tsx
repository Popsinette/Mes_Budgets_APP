import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/src/components/ui/Button';
import { FormField } from '@/src/components/ui/FormField';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { createCategory, deleteCategory, updateCategory } from '@/src/features/categories/repository';
import { palette, spacing, useTheme } from '@/src/theme';
import { confirmAction, notify } from '@/src/utils/dialogs';

const CATEGORY_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'pricetag-outline',
  'cart-outline',
  'home-outline',
  'car-outline',
  'restaurant-outline',
  'cafe-outline',
  'game-controller-outline',
  'heart-outline',
  'tv-outline',
  'shirt-outline',
  'school-outline',
  'paw-outline',
  'gift-outline',
  'airplane-outline',
  'fitness-outline',
  'musical-notes-outline',
  'phone-portrait-outline',
  'construct-outline',
];

const CATEGORY_COLORS = [
  palette.violet,
  palette.mint,
  palette.blue,
  palette.pink,
  palette.orange,
  palette.teal,
  palette.amber,
  palette.red,
  palette.purple,
  palette.slate,
];

export default function NewCategoryScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; name?: string; icon?: string; color?: string }>();
  const editingId = params.id ? Number(params.id) : null;

  const [name, setName] = useState(params.name ?? '');
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>(
    (params.icon as keyof typeof Ionicons.glyphMap) ?? 'pricetag-outline',
  );
  const [color, setColor] = useState(params.color ?? CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      notify('Nom manquant', 'Donnez un nom à cette catégorie (ex : Animaux).');
      return;
    }
    setSaving(true);
    if (editingId) {
      await updateCategory(db, { id: editingId, name: name.trim(), icon, color });
    } else {
      await createCategory(db, { name: name.trim(), icon, color });
    }
    router.back();
  };

  const remove = () => {
    if (!editingId) return;
    confirmAction({
      title: 'Supprimer la catégorie',
      message: `Supprimer « ${name} » ? Ses budgets seront supprimés ; ses opérations et factures passeront en « Sans catégorie ».`,
      confirmLabel: 'Supprimer',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await deleteCategory(db, editingId);
          router.back();
        })();
      },
    });
  };

  return (
    <Screen>
      <ModalHeader title={editingId ? 'Modifier la catégorie' : 'Nouvelle catégorie'} />

      <FormField label="Nom" value={name} onChangeText={setName} placeholder="Animaux, Sport, Enfants…" autoFocus />

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Icône</Text>
        <View style={styles.optionsRow}>
          {CATEGORY_ICONS.map((value) => (
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
          {CATEGORY_COLORS.map((value) => (
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

      <Button
        label={editingId ? 'Enregistrer' : 'Créer la catégorie'}
        onPress={() => void save()}
        loading={saving}
      />
      {editingId ? <Button label="Supprimer la catégorie" variant="danger" onPress={remove} /> : null}
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
