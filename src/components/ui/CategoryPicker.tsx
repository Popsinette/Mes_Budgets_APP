import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';
import { listCategories, type Category } from '@/src/features/categories/repository';
import { useLiveQuery } from '@/src/db/useLiveQuery';
import { CategoryIcon } from './CategoryIcon';

type CategoryPickerProps = {
  selectedId: number | null;
  onSelect: (category: Category) => void;
  /** Ids à exclure (ex : catégories ayant déjà un budget ce mois-ci). */
  excludeIds?: number[];
};

/** Grille de sélection de catégorie. */
export function CategoryPicker({ selectedId, onSelect, excludeIds = [] }: CategoryPickerProps) {
  const theme = useTheme();
  const { data: categories } = useLiveQuery((db) => listCategories(db));
  const visible = (categories ?? []).filter((c) => !excludeIds.includes(c.id));

  return (
    <View style={styles.grid}>
      {visible.map((category) => {
        const selected = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category)}
            style={[
              styles.item,
              {
                backgroundColor: selected ? `${category.color}22` : theme.colors.card,
                borderColor: selected ? category.color : theme.colors.border,
              },
            ]}
          >
            <CategoryIcon icon={category.icon} color={category.color} size={34} />
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: '31%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
  },
});
