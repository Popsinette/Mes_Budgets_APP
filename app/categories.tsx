import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/src/components/ui/Card';
import { CategoryIcon } from '@/src/components/ui/CategoryIcon';
import { ModalHeader } from '@/src/components/ui/ModalHeader';
import { Screen } from '@/src/components/ui/Screen';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { listCategories } from '@/src/features/categories/repository';
import { spacing, useTheme } from '@/src/theme';

export default function CategoriesScreen() {
  const theme = useTheme();
  const { data: categories } = useLiveQuery((db) => listCategories(db));

  return (
    <Screen>
      <ModalHeader title="Catégories" />
      <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>
        Touchez une catégorie pour la modifier (nom, icône, couleur) ou la supprimer.
      </Text>

      {(categories ?? []).map((category) => (
        <Card
          key={category.id}
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: '/nouvelle-categorie',
              params: {
                id: String(category.id),
                name: category.name,
                icon: category.icon,
                color: category.color,
              },
            })
          }
        >
          <CategoryIcon icon={category.icon} color={category.color} />
          <Text style={[styles.name, { color: theme.colors.text }]}>{category.name}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Card>
      ))}

      <Card
        style={[styles.row, { borderStyle: 'dashed', borderColor: theme.colors.primary }]}
        onPress={() => router.push('/nouvelle-categorie')}
      >
        <View style={[styles.addIcon, { backgroundColor: theme.colors.primary }]}>
          <Ionicons name="add" size={20} color={theme.colors.onPrimary} />
        </View>
        <Text style={[styles.name, { color: theme.colors.primary }]}>Nouvelle catégorie</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
