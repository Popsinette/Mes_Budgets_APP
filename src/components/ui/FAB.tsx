import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, useTheme } from '@/src/theme';

type FABProps = {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
};

/**
 * Bouton d'action flottant, au-dessus de la barre d'onglets. Sur grand écran
 * il reste ancré à la colonne de contenu (560 px centrés), pas au bord de la fenêtre.
 */
export function FAB({ onPress, icon = 'add' }: FABProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rightOffset = Math.max(spacing.lg, (width - 560) / 2 + spacing.lg);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Ajouter"
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered ?? false;
        return [
          styles.fab,
          {
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            bottom: insets.bottom + spacing.lg,
            right: rightOffset,
            transform: [{ scale: state.pressed ? 0.94 : hovered ? 1.05 : 1 }],
          },
        ];
      }}
    >
      <Ionicons name={icon} size={28} color={theme.colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
