import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '@/src/theme';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}>;

/** Carte plate : fond, filet fin, coins doux. Pas d'ombre lourde — le calme vient de l'air. */
export function Card({ children, style, onPress, onLongPress }: CardProps) {
  const theme = useTheme();
  const interactive = Boolean(onPress || onLongPress);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!interactive}
      style={(state) => {
        const pressed = state.pressed;
        // Survol (web uniquement) : la carte se signale d'une ombre à peine plus présente.
        const hovered = interactive && ((state as { hovered?: boolean }).hovered ?? false);
        return [
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            opacity: pressed && interactive ? 0.7 : 1,
            shadowOpacity: hovered ? 0.09 : 0.03,
            transform: [{ translateY: hovered && !pressed ? -1 : 0 }],
          },
          style,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#101014',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
});
